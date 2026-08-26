import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/045_fix_audit_completion_summary_return_types.sql", import.meta.url),
  "utf8",
);

describe("audit completion summary migration", () => {
  it("casts every aggregate RPC field to its declared return type", () => {
    expect(migration).toContain("docente_id INTEGER");
    expect(migration).toContain("docente_nombre TEXT");
    expect(migration).toContain("asignatura_id INTEGER");
    expect(migration).toContain("asignatura_nombre TEXT");
    expect(migration).toContain("grupo_id INTEGER");
    expect(migration).toContain("grupo_clave TEXT");
    expect(migration).toContain("completed_count BIGINT");
    expect(migration).toContain("latest_completed_at TIMESTAMPTZ");
    expect(migration).toContain("g.docente_id::INTEGER AS docente_id");
    expect(migration).toContain("a.nombre::TEXT AS asignatura_nombre");
    expect(migration).toContain("COUNT(c.id)::BIGINT AS completed_count");
    expect(migration).toContain("MAX(c.fecha_envio)::TIMESTAMPTZ AS latest_completed_at");
  });

  it("keeps the RPC aggregate-only and restricted to authenticated callers", () => {
    expect(migration).toContain("IF NOT public.audit_is_superadmin() THEN");
    expect(migration).not.toContain("c.estudiante_id");
    expect(migration).not.toContain("encuesta_estudiantil_respuestas");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.audit_completion_summary(INTEGER) TO authenticated;");
  });
});
