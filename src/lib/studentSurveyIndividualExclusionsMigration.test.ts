import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/119_student_survey_individual_exclusions.sql", import.meta.url),
  "utf8",
);

describe("individual student survey opt-outs", () => {
  it("keys the exclusion to student, cycle and group without seeding or deleting history", () => {
    expect(migration).toContain("PRIMARY KEY (estudiante_id, cuatrimestre_id, grupo_id)");
    expect(migration).toContain("g.id = NEW.grupo_id AND g.cuatrimestre_id = NEW.cuatrimestre_id");
    expect(migration).toContain("REVOKE ALL ON TABLE public.encuesta_estudiantil_exclusiones FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE|INSERT INTO)\s+public\.(?:inscripciones|encuesta_control_envio|encuesta_estudiantil_respuestas|encuesta_estudiantil_exclusiones)\b/i);
  });

  it("restricts access and audits changes without exposing student identifiers", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(migration).toMatch(/reason_code text NOT NULL CHECK \(reason_code ~ '[^']+'\)/);
    expect(migration).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.encuesta_estudiantil_exclusiones");
    expect(migration).toContain("public.audit_write_event(");
    expect(migration).toContain("'id_hash'");
    expect(migration).toMatch(/'encuesta_estudiantil_exclusiones:'\s*\|\|\s*\(v_row->>'estudiante_id'\)\s*\|\|\s*':'\s*\|\|\s*\(v_row->>'cuatrimestre_id'\)\s*\|\|\s*':'\s*\|\|\s*\(v_row->>'grupo_id'\)/);
    expect(migration).toContain("v_old_safe");
    expect(migration).toContain("v_new_safe");
    expect(migration).not.toMatch(/'estudiante_id', v_row->/);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.audit_exclusion_encuesta_row() FROM PUBLIC, anon, authenticated");
  });

  it("updates listing, both native submit paths, follow-up and progress without replacing authorization", () => {
    for (const rpc of [
      "obtener_evaluaciones_estudiante_actual()",
      "enviar_encuesta_estudiante(integer,jsonb,text)",
      "enviar_encuesta_estudiante_instrumento(integer,text,jsonb,text)",
      "admin_seguimiento_encuestas_estudiantes(integer)",
      "obtener_progreso_encuesta_estudiantil_nativa(integer)",
    ]) expect(migration).toContain(`'${rpc}'`);
    expect(migration).toContain("pg_catalog.pg_get_functiondef");
    expect(migration).toContain("RAISE EXCEPTION 'unexpected definition for %'");
    expect(migration).toContain("ELSIF v_name LIKE 'enviar_encuesta_estudiante%(%)' THEN");
    expect(migration).toContain("IF EXISTS (SELECT 1 FROM public.encuesta_estudiantil_exclusiones ex");
    expect(migration).toContain("RETURN QUERY SELECT ''not_enrolled''::TEXT; RETURN;");
    expect(migration).toContain("IF v_habilitada IS NOT TRUE THEN");
    expect(migration).toContain("control.id IS NOT NULL OR NOT EXISTS");
    expect(migration).toContain("ctl.id IS NOT NULL OR NOT EXISTS");
    expect(migration).toContain("public.encuesta_control_envio ce");
    expect(migration).toContain("ex.estudiante_id = i.estudiante_id AND ex.grupo_id = g.id");
    expect(migration).toContain("ex.cuatrimestre_id = p_cuatrimestre_id");
    expect(migration).toContain("ex.cuatrimestre_id = v_cuatrimestre_id");
    expect(migration).toContain("CD-07 is a SECURITY DEFINER SQL wrapper");
  });
});
