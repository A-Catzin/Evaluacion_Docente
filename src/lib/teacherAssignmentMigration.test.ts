import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/051_split_coordinator_teacher_relationships.sql", import.meta.url),
  "utf8",
);

describe("split teacher assignment migration", () => {
  it("backfills legacy assignments by role without granting coordinators observation", () => {
    expect(migration).toContain("CREATE TABLE public.coordinated_teacher_assignments");
    expect(migration).toContain("CREATE TABLE public.observation_teacher_assignments");
    expect(migration).toContain("CASE WHEN u.rol = 'coordinador' THEN 'coordinated' WHEN u.rol = 'observador' THEN 'observation' END");
    expect(migration).toContain("WHERE r.target_assignment_type = 'coordinated' AND r.status = 'backfilled'");
    expect(migration).toContain("WHERE r.target_assignment_type = 'observation' AND r.status = 'backfilled'");
    expect(migration).toContain("teacher_assignment_backfill_review");
  });

  it("enforces active roles, cycle-scoped revocation history, and purpose-specific capture", () => {
    expect(migration).toContain("coordinated_teacher_assignments_active_unique");
    expect(migration).toContain("observation_teacher_assignments_active_unique");
    expect(migration).toContain("active actor with an allowed role required");
    expect(migration).toContain("revoked_at = now(), revoked_by = auth.uid()");
    expect(migration).toContain("public.can_manage_coordinated_teacher");
    expect(migration).toContain("public.can_observe_assigned_teacher");
    expect(migration).toContain("observation assignment required");
    expect(migration).toContain("coordinated teacher assignment required");
  });

  it("keeps the test-cycle closure explicit and assignment administration restricted", () => {
    for (const table of ["coordinated_teacher_assignments", "observation_teacher_assignments", "teacher_assignment_backfill_review"]) {
      expect(migration).toContain(`'${table}'`);
      expect(migration).toContain(`public.test_cycle_delete_rows('${table}'`);
    }
    expect(migration).toContain("IF NOT public.audit_is_superadmin()");
    expect(migration).toContain("REVOKE ALL ON public.coordinated_teacher_assignments");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.replace_teacher_assignments");
    expect(migration).toContain("SET search_path TO ''");
  });
});
