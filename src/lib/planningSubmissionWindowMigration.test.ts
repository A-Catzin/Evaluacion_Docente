import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/050_teacher_planning_access_window.sql", import.meta.url), "utf8");

describe("teacher planning submission window migration", () => {
  it("uses fail-closed per-cycle scheduled windows with timestamptz bounds", () => {
    expect(migration).toContain("CREATE TABLE public.planning_submission_windows");
    expect(migration).toContain("cuatrimestre_id INTEGER PRIMARY KEY REFERENCES public.cuatrimestres(id)");
    expect(migration).toContain("opens_at TIMESTAMPTZ");
    expect(migration).toContain("closes_at TIMESTAMPTZ");
    expect(migration).toContain("mode IN ('manual_open', 'manual_closed', 'scheduled')");
    expect(migration).toContain("IF NOT FOUND THEN RETURN 'not_configured'");
    expect(migration).toContain("IF now() >= v_window.closes_at THEN RETURN 'scheduled_ended'");
  });

  it("limits configuration access and audits only safe window metadata", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("planning_submission_window_admin_state");
    expect(migration).toContain("planning_submission_window_admin_list");
    expect(migration).toContain("planning_submission_window_save");
    expect(migration).toContain("REVOKE ALL ON public.planning_submission_windows FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("'has_open_at'");
    expect(migration).not.toContain("v_row->>'comentario");
  });

  it("guards teacher writes without blocking coordinator evaluation and preserves test-cycle safeguards", () => {
    expect(migration).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.planeaciones");
    expect(migration).toContain("IF v_role IS DISTINCT FROM 'docente' THEN");
    expect(migration).toContain("teacher cannot change planning ownership or assignment");
    expect(migration).toContain("teacher cannot alter planning evaluation");
    expect(migration).toContain("g.modalidad = v_plan_modalidad");
    expect(migration).toContain("planning assignment is not owned by teacher in this cycle");
    expect(migration).toContain("PERFORM public.test_cycle_delete_rows('planning_submission_windows', v_cycle.id)");
    expect(migration).toContain("app.private_test_cycle_delete_audit_token");
    expect(migration).toContain("public.audit_test_cycle_row_suppression_active()");
  });
});
