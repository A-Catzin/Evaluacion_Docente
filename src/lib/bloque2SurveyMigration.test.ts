import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/120_disable_student_survey_bloque_2.sql", import.meta.url),
  "utf8",
);
const ids = (migration.match(/IN \(([\s\S]*?)\);/)?.[1] ?? "").split(",").map((id) => Number(id.trim()));

describe("Bloque 2 student survey migration", () => {
  it("disables only the survey switch for the 141 listed 27-1 groups", () => {
    expect(ids).toHaveLength(141);
    expect(new Set(ids).size).toBe(141);
    expect(ids.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true);
    expect(ids).toEqual(expect.arrayContaining([1019, 1036, 1100, 1101]));
    expect(migration).toContain("SET encuesta_estudiantil_habilitada = FALSE");
    expect(migration).toContain("WHERE g.cuatrimestre_id = 11");
  });

  it("keeps groups active and leaves existing responses untouched", () => {
    expect(migration).not.toMatch(/SET\s+activo/i);
    expect(migration).not.toMatch(/DELETE/i);
    expect(migration).not.toMatch(/encuesta_estudiantil_respuestas/);
  });
});
