import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync(new URL("../../supabase/migrations/105_cd07_real_assignment_manifest.sql", import.meta.url), "utf8");

describe("detached real CD-07 assignment manifest SQL (static only)", () => {
  it("uses internal assignment keys, unique cycle/group and fixed instrument identity", () => {
    const text = sql();
    expect(text).toMatch(/CREATE TABLE public\.student_cd07_real_assignment_manifest\s*\(/i);
    for (const [column, table] of Object.entries({ cuatrimestre_id: "cuatrimestres", grupo_id: "grupos", docente_id: "docentes", asignatura_id: "asignaturas" })) {
      expect(text).toMatch(new RegExp(`${column} INTEGER NOT NULL REFERENCES public\\.${table}\\(id\\)`, "i"));
    }
    expect(text).toMatch(/(?:PRIMARY KEY|UNIQUE)\s*\(cuatrimestre_id,\s*grupo_id\)/i);
    expect(text).toMatch(/instrument_code TEXT NOT NULL DEFAULT 'SED-360-INST-EST-CD-07-V1\.1' CHECK \(instrument_code = 'SED-360-INST-EST-CD-07-V1\.1'\)/i);
    expect(text).toMatch(/assignment_revision TEXT NOT NULL CHECK \(char_length\(assignment_revision\) BETWEEN 1 AND 120 AND btrim\(assignment_revision\) <> ''\)/i);
  });

  it("defaults inactive and requires approval provenance only when activated", () => {
    const text = sql();
    expect(text).toMatch(/is_active BOOLEAN NOT NULL DEFAULT false/i);
    expect(text).toMatch(/approval_reference TEXT/i);
    expect(text).toMatch(/approved_at TIMESTAMPTZ/i);
    expect(text).toMatch(/approved_by TEXT/i);
    expect(text).toMatch(/CHECK \(NOT is_active OR \(approval_reference IS NOT NULL AND btrim\(approval_reference\) <> '' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND btrim\(approved_by\) <> ''\)\)/i);
  });

  it("keeps the new table private and makes no activation or legacy changes", () => {
    const text = sql();
    expect(text).toMatch(/ALTER TABLE public\.student_cd07_real_assignment_manifest ENABLE ROW LEVEL SECURITY/i);
    expect(text).toMatch(/REVOKE ALL ON TABLE public\.student_cd07_real_assignment_manifest FROM PUBLIC, anon, authenticated, service_role/i);
    expect(text).not.toMatch(/\b(?:INSERT|GRANT|CREATE POLICY|CREATE (?:OR REPLACE )?FUNCTION|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(text).not.toMatch(/\b(?:encuesta_estudiantil_respuestas|encuesta_control_envio|TEST-CD|estudiante_id)\b/i);
    expect(text).not.toMatch(/\b(?:grupo_nombre|nombre_grupo|correo|email)\b/i);
  });
});
