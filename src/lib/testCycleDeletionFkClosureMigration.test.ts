import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/048_complete_test_cycle_fk_deletion.sql", import.meta.url),
  "utf8",
);

const liveCycleDependencies = [
  "autodiagnosticos", "autoevaluacion_docente", "calificacion_final_docente",
  "calificaciones_finales", "coordinador_docentes", "docente_360_feedback",
  "docente_modalidad_historica", "encuesta_control_envio", "encuesta_estudiantil",
  "encuesta_estudiantil_respuestas", "evaluacion_coordinacion", "evaluacion_planeacion",
  "grupos", "import_issues", "import_runs", "inscripciones", "institutional_notices",
  "observacion_clase", "observaciones", "planeaciones",
];

describe("test cycle FK closure migration", () => {
  it("approves and previews every live direct dependency, including the legacy final-grade table", () => {
    for (const table of liveCycleDependencies) expect(migration).toContain(`'${table}'`);
    expect(migration).toContain("jsonb_build_object(v_table, public.test_cycle_count_rows");
  });

  it("deletes known child relationships before their parents with scoped deletes", () => {
    const indexOf = (table: string) => migration.indexOf(`PERFORM public.test_cycle_delete_rows('${table}'`);

    expect(indexOf("import_issues")).toBeLessThan(indexOf("import_runs"));
    expect(indexOf("encuesta_estudiantil_respuestas")).toBeLessThan(indexOf("encuesta_control_envio"));
    expect(indexOf("inscripciones")).toBeLessThan(indexOf("grupos"));
    expect(indexOf("import_runs")).toBeLessThan(indexOf("grupos"));
    expect(indexOf("calificacion_final_docente")).toBeGreaterThan(-1);
    expect(migration).toContain("public.test_cycle_scope_predicate(c.relname) IS NULL");
  });

  it("guards optional legacy relations without weakening the FK-closure guard", () => {
    expect(migration).toContain("to_regclass('public.calificacion_final_docente') IS NOT NULL");
    expect(migration).toContain("to_regclass('public.docente_modalidad_historica') IS NOT NULL");
    expect(migration).toContain("to_regclass('public.encuesta_estudiantil') IS NOT NULL");
    expect(migration).toContain("ERRCODE = 'TC004'");
    expect(migration).not.toContain("CASCADE");
  });

  it("preserves confirmation, audit evidence, and queued storage cleanup", () => {
    expect(migration).toContain("public.test_cycle_assert_deletable(v_cycle, p_confirmation)");
    expect(migration).toContain("test_cycle.deletion_requested");
    expect(migration).toContain("'audit_events_retained', true");
    expect(migration).toContain("test_cycle_storage_cleanup");
    expect(migration).not.toContain("DELETE FROM public.audit_events");
    expect(migration).not.toContain("DELETE FROM public.change_sets");
    expect(migration).not.toContain("DELETE FROM public.restore_points");
  });
});
