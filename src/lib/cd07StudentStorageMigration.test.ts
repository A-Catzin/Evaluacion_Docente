import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync(new URL("../../supabase/migrations/104_cd07_response_storage.sql", import.meta.url), "utf8");

describe("detached CD-07 response storage SQL (static only)", () => {
  it("creates an independent anonymous response identity with assignment snapshot foreign keys", () => {
    const text = sql();
    expect(text).toMatch(/CREATE TABLE public\.encuesta_estudiantil_cd07_respuestas\s*\(/i);
    expect(text).toMatch(/id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY/i);
    for (const [column, table] of Object.entries({ cuatrimestre_id: "cuatrimestres", grupo_id: "grupos", docente_id: "docentes", asignatura_id: "asignaturas" })) {
      expect(text).toMatch(new RegExp(`${column} INTEGER NOT NULL REFERENCES public\\.${table}\\(id\\)`, "i"));
    }
    expect(text).not.toMatch(/\b(?:estudiante_id|control_id|encuesta_control_envio)\b/i);
  });

  it("bounds exact version, opaque revision, answers and optional comment at DB boundary", () => {
    const text = sql();
    expect(text).toMatch(/instrument_code TEXT NOT NULL CHECK \(instrument_code = 'SED-360-INST-EST-CD-07-V1\.1'\)/i);
    expect(text).toMatch(/assignment_revision TEXT NOT NULL CHECK \(char_length\(assignment_revision\) BETWEEN 1 AND 120 AND btrim\(assignment_revision\) <> ''\)/i);
    expect(text).toMatch(/respuestas SMALLINT\[\] NOT NULL/i);
    expect(text).toMatch(/response_origin TEXT NOT NULL CHECK \(response_origin IN \('real', 'fixture'\)\)/i);
    expect(text).toMatch(/array_ndims\(respuestas\) = 1/i);
    expect(text).toMatch(/cardinality\(respuestas\) = 20/i);
    expect(text).toMatch(/array_position\(respuestas, NULL\) IS NULL/i);
    expect(text).toMatch(/respuestas <@ ARRAY\[1, 2, 3, 4, 5\]::SMALLINT\[\]/i);
    expect(text).toMatch(/comentario_abierto TEXT CHECK \(char_length\(comentario_abierto\) <= 2000\)/i);
    expect(text).toMatch(/capturada_en TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it("keeps all array predicates in one non-null constrained check, including two-dimensional and null-element guards", () => {
    const text = sql();
    const check = text.match(/CONSTRAINT cd07_respuestas_exactas CHECK \(([\s\S]*?)\n  \)/i)?.[1];
    expect(check).toMatch(/array_ndims\(respuestas\) = 1\s+AND cardinality\(respuestas\) = 20\s+AND array_position\(respuestas, NULL\) IS NULL\s+AND respuestas <@ ARRAY\[1, 2, 3, 4, 5\]::SMALLINT\[\]/i);
    expect(text).toMatch(/assignment_revision TEXT NOT NULL CHECK/i);
    expect(text).toMatch(/instrument_code TEXT NOT NULL CHECK/i);
  });

  it("requires explicit real or fixture origin without an implicit default or extra origin", () => {
    const text = sql();
    const column = text.match(/^\s*response_origin\s+([^\n]+)$/im)?.[1];
    expect(column).toMatch(/^TEXT NOT NULL CHECK \(response_origin IN \('real', 'fixture'\)\),$/i);
    expect(column).not.toMatch(/DEFAULT|unknown|test/i);
  });

  it("denies direct access and preserves historic tables and routines", () => {
    const text = sql();
    expect(text).toMatch(/ALTER TABLE public\.encuesta_estudiantil_cd07_respuestas ENABLE ROW LEVEL SECURITY/i);
    expect(text).toMatch(/REVOKE ALL ON TABLE public\.encuesta_estudiantil_cd07_respuestas FROM PUBLIC, anon, authenticated, service_role/i);
    expect(text).toMatch(/REVOKE ALL ON SEQUENCE public\.encuesta_estudiantil_cd07_respuestas_id_seq FROM PUBLIC, anon, authenticated, service_role/i);
    expect(text).not.toMatch(/\b(?:GRANT|CREATE POLICY|CREATE (?:OR REPLACE )?FUNCTION|CREATE TRIGGER|DELETE|UPDATE|INSERT|DROP|TRUNCATE|refrescar_resultados_agregados)\b/i);
    expect(text).not.toMatch(/\b(?:encuesta_estudiantil_respuestas|encuesta_control_envio)\b/i);
  });
});
