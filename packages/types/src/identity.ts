import type { CurrencyCode } from "./money";
import type { TenantId } from "./domain";

/**
 * Identity + data-driven RBAC (migrations V7/V8/V9, ADR-0011) — the TS mirror
 * of `backend/contracts` User/Role/Permission/Membership/etc.
 *
 * The layering: `tenant` stays the RLS isolation boundary; a `User` is a
 * GLOBAL identity (one person, possibly many tenants); a `Membership`
 * (user × tenant × role) is the heart of RBAC. Credentials live in Supabase
 * Auth — `User.authSubject` is the `auth.users.id` (JWT `sub`); no password
 * is ever stored here.
 */

export type UserId = string;
export type RoleId = string;
export type PermissionId = string;
export type InvitationId = string;

export type UserStatus = "active" | "suspended" | "deleted";
export type MembershipStatus = "active" | "invited" | "suspended";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** The Money Tracker design direction a user prefers (persisted, V8). */
export type PersonaTheme = "genz" | "millennial" | "senior";

/** A global identity — NOT tenant-scoped. */
export interface User {
  id: UserId;
  /** Supabase auth.users.id (JWT `sub`); null until first sign-in links it. */
  authSubject: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * A role: system roles (tenantId null, isSystem true — owner/admin/member/
 * viewer) are shared by every tenant; tenants may define custom roles.
 */
export interface Role {
  id: RoleId;
  tenantId: TenantId | null;
  key: string; // "owner" | "admin" | "member" | "viewer" | custom
  label: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
}

/** One entry of the global resource:action catalogue (31 seeded). */
export interface Permission {
  id: PermissionId;
  key: string; // e.g. "statement:write"
  resource: string; // e.g. "statement"
  action: "read" | "write" | "manage";
  description: string | null;
}

/** The (user × tenant × role) assignment — the heart of RBAC. */
export interface Membership {
  userId: UserId;
  tenantId: TenantId;
  roleId: RoleId;
  status: MembershipStatus;
  invitedBy: UserId | null;
  joinedAt: string;
}

/** A pending invite for an email to join a tenant at a role. */
export interface Invitation {
  id: InvitationId;
  tenantId: TenantId;
  email: string;
  roleId: RoleId;
  token: string;
  status: InvitationStatus;
  invitedBy: UserId | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** Per-USER UI + notification preferences — follow the user across tenants. */
export interface UserSettings {
  userId: UserId;
  preferredTheme: PersonaTheme;
  locale: string; // e.g. "en-IN"
  logRemindersEnabled: boolean;
  spendingAlertsEnabled: boolean;
  updatedAt: string;
}

/** Workspace-wide budget behaviour (one row per tenant). */
export interface TenantSettings {
  tenantId: TenantId;
  monthlyRolloverEnabled: boolean;
  defaultCurrency: CurrencyCode;
  updatedAt: string;
}

/**
 * Each member's own income figures WITHIN a tenant — powers the per-person
 * runway / savings-rate lenses. Money fields are paise, null until collected.
 */
export interface FinancialProfile {
  tenantId: TenantId;
  userId: UserId;
  dateOfBirth: string | null; // ISO date
  monthlyTakeHomeMinor: number | null;
  annualPretaxIncomeMinor: number | null;
  currency: CurrencyCode;
  updatedAt: string;
}
