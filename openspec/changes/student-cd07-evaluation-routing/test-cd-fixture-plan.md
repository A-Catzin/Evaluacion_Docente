# Proposed TEST-CD fixture transaction plan — NOT approved for execution

**Decision boundary:** The user selected an isolated, non-credit fixture definition: subject key/name `TEST-CD`, zero credits, inactive; group key `TEST-CD`, modality `Prueba`, with one explicit enrollment. This approves plan metadata only. Do not insert rows, deploy, activate routing, or submit answers. TEST-CD is outside the selected 20 real CSV-present assignments and their inactive real-assignment manifest.

## Evidence and intended rows

The parent supplied bounded GET-only evidence: one active student-role account matched one student entity; one active teacher-role account matched one active teacher entity, resolved from user-provided addresses; one active/open 27-1 cycle; exact subject key/name and group key absent in that cycle. No identifiers or personal records are reproduced here. This evidence is not a fresh transaction-time check or production-write approval.

| Proposed row | Values and binding (not executable SQL) |
|---|---|
| `asignaturas` | `clave=TEST-CD`, `nombre=TEST-CD`, `creditos=0`, `activa=false`; generated ID. Key is globally unique; required key ≤20 and name ≤150. Do not rely on credit default 5 or active default true. |
| `grupos` | `clave=TEST-CD`, `modalidad=Prueba`, `activo=true`, `num_alumnos=1`; generated ID and freshly resolved subject/teacher/active 27-1 cycle foreign keys. Optional `plan_normalizado`, `grado`, `grupo_normalizado`, `importacion_key` remain NULL pending exact schema confirmation; do not invent program or grade. Key ≤20. |
| `inscripciones` | Exactly one enrollment binding the freshly verified existing test student to this **assignment group** and cycle; enforce unique `(student, assignment group, cycle)`. No bulk assignment import: it copies base-group enrollments. |
| Fixture authorization (unresolved schema) | Separately designed off-by-default gate/classification keyed by exact cycle/group/teacher/subject tuple, not name or client flag. No table, fields, or executable write can be prescribed until reviewed schema and trusted RPC exist. Never add TEST-CD to the 20-real manifest. |

## Preflight before any later, separately approved transaction

1. Implement and stage-verify complete group-grain fixture exclusion at the **DB score/progress sources before counts and eligible-enrollment denominators**, plus every institutional report, export, comment, cache, refresh and recalculation consumer. An empty active group alone can alter denominators; source exclusion must precede even its creation. Keep fixture gate and routing disabled by default; test spoofing and mixed real/fixture teacher behavior in staging.
2. Obtain fresh transaction-time checks of account activity/roles and uniquely linked student and active teacher entities; active/open cycle, exact subject/group uniqueness (including global subject key), assignment and enrollment uniqueness, and no conflicting fixture classification. Resolve keys only inside the reviewed transaction; never hard-code IDs or use client-supplied identity.
3. Review exact deployed table columns/constraints, migration ledger, privileges/RLS, audit triggers on the three insert targets, and completion audit semantics; reconcile before/after counts and protected audit events without exposing identities. Verify transaction atomicity, effective grants and failure behavior in staging. No backup/restore has been verified; the user requested a pause, so recovery readiness is an explicit unresolved risk, not an assumed safeguard.
4. Prepare an isolated deployment package rather than deploying the dirty working tree. Seek explicit approval of the exact production transaction and its operator, scope, checks and recovery separately from this metadata choice; without it, stop. No production DML, DDL, SQL script or operation is authorized by this document.

## Post-write checks and recovery (future only)

If separately authorized after the prerequisites, reconcile exactly one subject, group and enrollment against the fresh trusted tuple; confirm the fixture remains outside the 20-real manifest and all institutional score/progress/denominator/report outputs while test-only eligibility remains gated. Preserve protected audit evidence and do not expose responses or private identities. On failure disable fixture gate/route, retain committed controls, submissions and audit, and obtain a reviewed forward-cleanup plan. Never blindly DELETE or replay destructive migration 043. **Current state:** plan proposed only; no fixture rows, gate or production transaction executed here.
