import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/055_fix_cycle_teacher_candidate_eligibility.sql", import.meta.url),
  "utf8",
);

describe("cycle teacher candidate eligibility migration", () => {
  it("treats legacy NULL group activity as active while excluding inactive teachers and groups", () => {
    expect(migration).toContain("d.activo IS TRUE");
    expect(migration).toContain("g.docente_id = d.id");
    expect(migration).toContain("g.cuatrimestre_id = p_cuatrimestre_id");
    expect(migration).toContain("COALESCE(g.activo, true) IS TRUE");
  });

  it("uses the same server-side candidate predicate for manual candidates, allocation, and confirmation", () => {
    expect(migration).toContain("public.active_cycle_teacher_candidates(p_cuatrimestre_id) eligible");
    expect(migration).toContain("public.active_cycle_teacher_candidates(v_preview.cuatrimestre_id) eligible");
    expect(migration).toContain("p_include_all_active");
    expect(migration).toContain("eligible active teacher ids required");
  });

  it("matches the declared candidate RPC return types and exposes aggregate-only diagnostics", () => {
    expect(migration).toContain("d.nombre::TEXT");
    expect(migration).toContain("d.apellidos::TEXT");
    expect(migration).toContain("public.admin_assignment_teacher_candidate_diagnostics");
    expect(migration).toContain("legacy_active_group_count BIGINT");
  });
});
