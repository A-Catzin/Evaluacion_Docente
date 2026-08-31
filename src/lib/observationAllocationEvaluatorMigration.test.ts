import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/053_fix_observation_allocation_evaluators.sql", import.meta.url),
  "utf8",
);

describe("observation allocation evaluator repair migration", () => {
  it("lists every resolved active evaluator role without requiring prior assignments", () => {
    expect(migration).toContain("public.admin_observation_allocation_evaluators");
    expect(migration).toContain("u.rol IN ('superadmin', 'coordinador', 'observador')");
    expect(migration).toContain("u.activo IS TRUE");
    expect(migration).toContain("JOIN auth.users au ON au.id = u.id");
    expect(migration).toContain("LEFT JOIN public.observation_teacher_assignments a");
  });

  it("keeps allocation and purpose-specific authorization bound to the same active resolved account", () => {
    expect(migration).toContain("public.is_active_coordinator");
    expect(migration).toContain("public.is_active_observation_evaluator");
    expect(migration).toContain("public.can_manage_coordinated_teacher");
    expect(migration).toContain("public.can_observe_assigned_teacher");
    expect(migration).toContain("public.enforce_staff_assignment_authorization");
    expect(migration).toContain("active resolved actor with an allowed role required");
  });

  it("provides superadmin-only aggregate diagnostics without returning account details", () => {
    expect(migration).toContain("public.admin_observation_allocation_evaluator_diagnostics");
    expect(migration).toContain("'auth_account_without_profile'");
    expect(migration).toContain("'profile_without_auth_account'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_observation_allocation_evaluator_diagnostics(INTEGER) TO authenticated");
  });
});
