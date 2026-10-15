import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync(new URL("../../supabase/migrations/106_cd07_fixture_authorization.sql", import.meta.url), "utf8");

describe("detached CD-07 fixture authorization SQL (static only)", () => {
  it("keys a separate fixture gate to internal assignment identities and a bounded revision", () => {
    const text = sql();
    expect(text).toMatch(/CREATE TABLE public\.student_cd07_fixture_authorization\s*\(/i);
    for (const [column, table] of Object.entries({ cuatrimestre_id: "cuatrimestres", grupo_id: "grupos", docente_id: "docentes", asignatura_id: "asignaturas" })) {
      expect(text).toMatch(new RegExp(`${column} INTEGER NOT NULL REFERENCES public\\.${table}\\(id\\)`, "i"));
    }
    expect(text).toMatch(/PRIMARY KEY \(cuatrimestre_id, grupo_id\)/i);
    expect(text).toMatch(/assignment_revision TEXT NOT NULL CHECK \(char_length\(assignment_revision\) BETWEEN 1 AND 120 AND btrim\(assignment_revision\) <> ''\)/i);
  });

  it("requires fixed code and independent approval before enabling", () => {
    const text = sql();
    expect(text).toMatch(/instrument_code TEXT NOT NULL CHECK \(instrument_code = 'SED-360-INST-EST-CD-07-V1\.1'\)/i);
    expect(text).toMatch(/is_enabled BOOLEAN NOT NULL DEFAULT false/i);
    expect(text).toMatch(/NOT is_enabled OR \(approval_reference IS NOT NULL AND btrim\(approval_reference\) <> ''\s+AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND btrim\(approved_by\) <> ''\)/i);
    expect(text).not.toMatch(/is_enabled BOOLEAN NOT NULL DEFAULT true/i);
  });

  it("stays empty, private and inert without changing legacy or real registry", () => {
    const text = sql();
    expect(text).toMatch(/ALTER TABLE public\.student_cd07_fixture_authorization ENABLE ROW LEVEL SECURITY/i);
    expect(text).toMatch(/REVOKE ALL ON TABLE public\.student_cd07_fixture_authorization FROM PUBLIC, anon, authenticated, service_role/i);
    expect(text).not.toMatch(/\b(?:INSERT|GRANT|CREATE POLICY|CREATE (?:OR REPLACE )?FUNCTION|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(text).not.toMatch(/\b(?:TEST-CD|estudiante_id|grupo_nombre|nombre_grupo|correo|email|encuesta_control_envio|encuesta_estudiantil_respuestas|student_cd07_real_assignment_manifest)\b/i);
  });
});
