import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/046_safe_test_cycle_hard_delete.sql", import.meta.url),
  "utf8",
);

describe("safe test cycle deletion migration", () => {
  it("uses an explicit test marker and server-side exact confirmation", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT false");
    expect(migration).toContain("p_confirmation IS DISTINCT FROM public.test_cycle_label(v_cycle)");
    expect(migration).toContain("v_cycle.activo OR NOT v_cycle.es_prueba");
  });

  it("fails closed for unreviewed live foreign-key dependencies instead of cascading", () => {
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("unreviewed cycle dependency");
    expect(migration).not.toContain("CASCADE");
  });

  it("records a non-PII summary and retains audit/change-set evidence", () => {
    expect(migration).toContain("test_cycle.deletion_requested");
    expect(migration).toContain("'audit_events_retained', true");
    expect(migration).not.toContain("DELETE FROM public.audit_events");
    expect(migration).not.toContain("DELETE FROM public.change_sets");
    expect(migration).not.toContain("DELETE FROM public.restore_points");
  });

  it("explicitly covers the reviewed operational tables in dependency order", () => {
    for (const table of [
      "grupos", "inscripciones", "coordinador_docentes", "encuesta_control_envio",
      "encuesta_estudiantil_respuestas", "evaluacion_coordinacion", "planeaciones",
      "observaciones", "autodiagnosticos", "calificaciones_finales",
      "docente_modalidad_historica", "institutional_notices", "import_runs", "import_issues",
    ]) expect(migration).toContain(`'${table}'`);
  });
});
