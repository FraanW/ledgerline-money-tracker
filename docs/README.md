# `docs/` — Technical Documentation

Documentation that lives with the code. (Recruiter-facing docs live in `../context/`.)

| File | What's inside |
|---|---|
| `MODULE-MAP.md` | Canonical mapping of the 18 modules to folders, with owners and languages. |
| `development.md` | Day-to-day developer workflow — install, run, test, k3d, load tests, gotchas. |
| `module-interfaces/` | Per-module interface specs. One file per module: `M<n>-<slug>.md`. Each documents inputs, outputs, event schemas, error contracts. Populated by Spock as modules get designed. |
| `runbooks/` | Operational runbooks — deploy, rollback, on-call incident response. Populated as the system goes live. |

## When to add a doc here vs `../context/`

- **Here (`docs/`):** technical specs, interface contracts, runbooks, anything a developer working in the repo needs.
- **`../context/`:** the why, the what, the architecture story, decisions (ADRs). Anything a recruiter or new collaborator reads to understand the project.
