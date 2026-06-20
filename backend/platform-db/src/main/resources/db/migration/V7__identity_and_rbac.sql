-- =============================================================================
-- M5+ — Migration 0007: Identity layer + data-driven RBAC
-- =============================================================================
-- V1-V6 modelled the world as "tenant == one implicit user". This migration
-- adds the missing IDENTITY layer (real users) and a DATA-DRIVEN RBAC model,
-- WITHOUT touching the existing tenant-scoped tables or their RLS.
--
-- THE LAYERING (why this is non-breaking)
-- -----------------------------------------------------------------------------
--   tenant      = the household / workspace = the RLS isolation boundary (V1-V6).
--   user        = a person (global identity, can belong to many tenants).
--   membership  = (user x tenant x role)  -> the heart of RBAC.
-- The request pipeline resolves the acting tenant from the caller's membership,
-- validates the role, then sets `app.current_tenant` EXACTLY as today. Every
-- V1-V6 table keeps filtering on app.current_tenant — unchanged.
--
-- AUTH BACKING — SUPABASE (ADR-0011)
-- -----------------------------------------------------------------------------
-- Credentials live in Supabase Auth (auth.users). Our `users.auth_subject`
-- stores that subject (the JWT `sub`). We store NO password hash. A user row is
-- provisioned by the control plane (an auth webhook / the owner connection) on
-- first sign-in.
--
-- CONTROL-PLANE vs TENANT-SCOPED (RLS strategy)
-- -----------------------------------------------------------------------------
-- Like `tenants` (V2, no RLS), some rows here are control-plane:
--   * users           — global identity; ENABLE (not FORCE) RLS so the owner/
--                        migration role can PROVISION users, while the runtime
--                        `ledgerline_app` role sees only self + co-members.
--   * permissions     — a fixed global catalogue; readable reference data.
--   * system roles    — tenant_id IS NULL, shared by every tenant.
-- Tenant-scoped rows get the standard V3 FORCE + app.current_tenant policy:
--   * roles (custom)  — tenant_id set.
--   * role_permissions, memberships, invitations.
--
-- NEW GUC — app.current_user_id
-- -----------------------------------------------------------------------------
-- `users` self-visibility keys off a second per-connection GUC,
-- `app.current_user_id`, set alongside `app.current_tenant` by the runtime
-- (TenantContext, wired in Sweep 1). Until it is set it reads NULL and the
-- self-clause is simply false (co-member visibility via the current tenant still
-- works) — a safe fail-closed default.
-- =============================================================================

-- Case-insensitive email equality/uniqueness (contrib; present on pg16 image).
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- enums ----------
CREATE TYPE user_status       AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE membership_status AS ENUM ('active', 'invited', 'suspended');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');


-- ---------- users — global identity (control plane) ----------
-- NOT tenant-scoped: a user can be a member of many tenants. auth_subject maps
-- to Supabase auth.users.id (nullable until the first sign-in links it).
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject UUID        UNIQUE,                      -- Supabase auth.users.id
  email        CITEXT      NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  avatar_url   TEXT,
  status       user_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------- roles — data-driven (system + per-tenant custom) ----------
-- System roles: tenant_id IS NULL, is_system = true, shared by all tenants.
-- Custom roles: tenant_id set; a tenant may define its own.
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system role
  key         TEXT        NOT NULL,                            -- 'owner','admin',...
  label       TEXT        NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A system role key is globally unique; a custom role key is unique per tenant.
CREATE UNIQUE INDEX uq_roles_system_key ON roles (key)            WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX uq_roles_tenant_key ON roles (tenant_id, key) WHERE tenant_id IS NOT NULL;


-- ---------- permissions — global (resource, action) catalogue ----------
-- Reference data: seeded here, managed by the control plane, never tenant-scoped.
CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,   -- 'transaction:read', 'member:manage', ...
  resource    TEXT NOT NULL,          -- 'transaction'
  action      TEXT NOT NULL,          -- 'read' | 'write' | 'manage'
  description TEXT
);


-- ---------- role_permissions — which permissions a role grants ----------
-- tenant_id is DENORMALISED (NULL for system roles) so the RLS predicate is a
-- plain tenant check without joining through roles.
CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL for system roles
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_role ON role_permissions (role_id);


-- ---------- memberships — (user x tenant x role): the RBAC assignment ----------
CREATE TABLE memberships (
  user_id    UUID              NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id  UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id    UUID              NOT NULL REFERENCES roles(id)   ON DELETE RESTRICT,
  status     membership_status NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX idx_memberships_tenant ON memberships (tenant_id);
CREATE INDEX idx_memberships_user   ON memberships (user_id);


-- ---------- invitations — pending invites to join a tenant at a role ----------
CREATE TABLE invitations (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       CITEXT            NOT NULL,
  role_id     UUID              NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  token       TEXT              NOT NULL UNIQUE,
  status      invitation_status NOT NULL DEFAULT 'pending',
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ       NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_tenant ON invitations (tenant_id);
CREATE INDEX idx_invitations_email  ON invitations (email);


-- =============================================================================
-- SEED — system roles, the permission catalogue, and the role->permission matrix
-- (Done BEFORE enabling RLS below so the owner-run migration can insert freely.)
-- =============================================================================

INSERT INTO roles (tenant_id, key, label, description, is_system) VALUES
  (NULL, 'owner',  'Owner',  'Full control incl. members, roles, and the workspace itself', true),
  (NULL, 'admin',  'Admin',  'Manage members and all financial data; cannot delete the workspace', true),
  (NULL, 'member', 'Member', 'Read and write financial data; no member/role management', true),
  (NULL, 'viewer', 'Viewer', 'Read-only access to all financial data', true);

INSERT INTO permissions (key, resource, action, description) VALUES
  ('transaction:read',  'transaction', 'read',   'View transactions'),
  ('transaction:write', 'transaction', 'write',  'Create/edit/delete transactions'),
  ('account:read',      'account',     'read',   'View linked accounts'),
  ('account:write',     'account',     'write',  'Link/edit/remove accounts'),
  ('category:read',     'category',    'read',   'View categories'),
  ('category:write',    'category',    'write',  'Create/edit/delete categories'),
  ('envelope:read',     'envelope',    'read',   'View budget envelopes'),
  ('envelope:write',    'envelope',    'write',  'Create/allocate/move envelopes'),
  ('rule:read',         'rule',        'read',   'View categorization rules'),
  ('rule:write',        'rule',        'write',  'Create/edit/delete categorization rules'),
  ('holding:read',      'holding',     'read',   'View investment holdings'),
  ('holding:write',     'holding',     'write',  'Create/edit/delete holdings'),
  ('goal:read',         'goal',        'read',   'View goals'),
  ('goal:write',        'goal',        'write',  'Create/edit/delete goals'),
  ('networth:read',     'networth',    'read',   'View net-worth items'),
  ('networth:write',    'networth',    'write',  'Create/edit/delete net-worth items'),
  ('recurring:read',    'recurring',   'read',   'View recurring series'),
  ('recurring:write',   'recurring',   'write',  'Edit/confirm recurring series'),
  ('statement:read',    'statement',   'read',   'View statement uploads'),
  ('statement:write',   'statement',   'write',  'Upload statements / trigger ingestion'),
  ('profile:read',      'profile',     'read',   'View financial profile'),
  ('profile:write',     'profile',     'write',  'Edit financial profile'),
  ('settings:read',     'settings',    'read',   'View settings'),
  ('settings:write',    'settings',    'write',  'Edit settings'),
  ('member:read',       'member',      'read',   'View members'),
  ('member:manage',     'member',      'manage', 'Invite/remove members, change their role'),
  ('invitation:read',   'invitation',  'read',   'View invitations'),
  ('invitation:manage', 'invitation',  'manage', 'Create/revoke invitations'),
  ('role:read',         'role',        'read',   'View roles'),
  ('role:manage',       'role',        'manage', 'Create/edit custom roles'),
  ('tenant:manage',     'tenant',      'manage', 'Rename/delete the workspace, billing');

-- owner: everything
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.key = 'owner';

-- admin: everything except deleting the workspace
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.key = 'admin' AND p.key <> 'tenant:manage';

-- member: all reads + writes on financial data (no member/role/tenant management)
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.key = 'member'
  AND ( p.action = 'read'
     OR ( p.action = 'write' AND p.resource IN
          ('transaction','account','category','envelope','rule','holding',
           'goal','networth','recurring','statement','profile','settings') ) );

-- viewer: reads only
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, NULL FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.key = 'viewer' AND p.action = 'read';


-- =============================================================================
-- RLS
-- =============================================================================

-- ---------- users — self + co-member visibility (ENABLE, not FORCE) ----------
-- ENABLE (not FORCE) so the owner/control-plane role can provision users while
-- the runtime app role is constrained to self + members sharing the current
-- tenant. (See header: app.current_user_id GUC.)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_or_comember ON users
  USING (
        id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
     OR EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.user_id = users.id
            AND m.tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        )
  )
  WITH CHECK (
        id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- ---------- roles — system (NULL) visible to all; custom scoped to tenant ----------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE  ROW LEVEL SECURITY;
CREATE POLICY roles_visibility ON roles
  USING      (tenant_id IS NULL
              OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  -- the app may only create/modify CUSTOM roles in its own tenant (never system).
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- role_permissions — same shape as roles (denormalised tenant_id) ----------
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE  ROW LEVEL SECURITY;
CREATE POLICY role_permissions_visibility ON role_permissions
  USING      (tenant_id IS NULL
              OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- memberships — standard tenant isolation ----------
-- Cross-tenant "which workspaces am I in?" is resolved at login by the control
-- plane (owner connection), NOT through this tenant-scoped path.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE  ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- invitations — standard tenant isolation ----------
-- Accepting an invite by token (invitee not yet a member) is a control-plane op.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE  ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation ON invitations
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- =============================================================================
-- App-role grants
-- =============================================================================
-- users: read (resolve self / co-members) + update (edit own profile). INSERT/
--   DELETE stay control-plane (owner). permissions: read-only catalogue.
GRANT SELECT, UPDATE                         ON users            TO ledgerline_app;
GRANT SELECT                                 ON permissions      TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON roles            TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON role_permissions TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON memberships      TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE         ON invitations      TO ledgerline_app;
