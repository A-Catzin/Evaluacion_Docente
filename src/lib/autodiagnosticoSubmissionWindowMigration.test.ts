import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/078_autodiagnostico_submission_access_window.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("autodiagnostico submission window migration", () => {
  it("uses fail-closed per-cycle scheduled windows with strict bounds", () => {
    expect(migration).toContain(
      "CREATE TABLE public.autodiagnostico_submission_windows",
    );
    expect(migration).toContain(
      "cuatrimestre_id INTEGER PRIMARY KEY REFERENCES public.cuatrimestres(id)",
    );
    expect(migration).toContain("opens_at TIMESTAMPTZ");
    expect(migration).toContain("closes_at TIMESTAMPTZ");
    expect(migration).toContain(
      "mode IN ('manual_open', 'manual_closed', 'scheduled')",
    );
    expect(migration).toContain("IF NOT FOUND THEN RETURN 'not_configured'");
    expect(migration).toContain(
      "IF now() >= v_window.closes_at THEN RETURN 'scheduled_ended'",
    );
  });

  it("restricts direct configuration access and audits safe metadata", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON public.autodiagnostico_submission_windows FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("autodiagnostico_submission_window_admin_list");
    expect(migration).toContain("autodiagnostico_submission_window_save");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("'has_open_at'");
    expect(migration).not.toContain(
      "autoevaluacion_docente_submission_windows",
    );
  });

  it("fails closed when the authenticated user has no active profile", () => {
    expect(migration).toContain(
      "COALESCE(v_role, '') NOT IN ('superadmin', 'coordinador', 'docente', 'pendiente')",
    );
  });

  it("guards only new teacher autodiagnostico inserts and preserves safe test-cycle cleanup", () => {
    const retainedDependencies = [
      "coordinated_teacher_assignments",
      "observation_teacher_assignments",
      "teacher_assignment_backfill_review",
      "instrument_submissions",
      "instrument_answers",
      "instrument_evidence",
      "instrument_administrative_check_answers",
      "observation_allocation_preferences",
      "observation_allocation_previews",
      "observation_allocation_runs",
      "planning_subject_np",
      "planning_group_np",
    ];

    expect(migration).toContain("BEFORE INSERT ON public.autodiagnosticos");
    expect(migration).toContain(
      "IF auth.uid() IS NOT NULL AND v_role IS NULL THEN",
    );
    expect(migration).toContain("IF v_role IS DISTINCT FROM 'docente' THEN");
    expect(migration).toContain("autodiagnostico_submission_window_is_open");
    expect(migration).not.toContain(
      "UPDATE OR DELETE ON public.autodiagnosticos",
    );
    expect(migration).toContain("'autodiagnostico_submission_windows'");
    expect(migration).toContain(
      "PERFORM public.test_cycle_delete_rows('autodiagnostico_submission_windows', v_cycle.id)",
    );
    for (const dependency of retainedDependencies) {
      expect(migration).toContain(`'${dependency}'`);
      expect(migration).toContain(
        `PERFORM public.test_cycle_delete_rows('${dependency}', v_cycle.id)`,
      );
    }
    expect(migration).toContain("app.private_test_cycle_delete_audit_token");
    expect(migration).toContain(
      "public.audit_test_cycle_row_suppression_active()",
    );
  });
});
