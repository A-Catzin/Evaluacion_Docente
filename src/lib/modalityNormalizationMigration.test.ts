import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/056_normalize_escolarizado_modality.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacyModality = "Escolariz" + "ada";

describe("Escolarizado modality normalization migration", () => {
  it("normalizes exact legacy values in every applicable public base-table column", () => {
    expect(migration).toContain("information_schema.columns");
    expect(migration).toContain("table_schema = 'public'");
    expect(migration).toContain(
      "column_name IN ('modalidad', 'modalidad_snapshot')",
    );
    expect(migration).toContain(`'${legacyModality}'`);
    expect(migration).toContain("'Escolarizado'");
    expect(migration).toContain("EXECUTE format(");
  });

  it("replaces the planning trigger with the canonical active-group condition", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.enforce_teacher_planning_submission_window()",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("NEW.estado IS DISTINCT FROM 'Pendiente'");
    expect(migration).toContain("g.modalidad = v_plan_modalidad");
    expect(migration).toContain("g.modalidad = 'Escolarizado'");
    expect(migration).not.toContain(`g.modalidad = '${legacyModality}'`);
    expect(migration).toContain("g.activo IS TRUE");
  });
});
