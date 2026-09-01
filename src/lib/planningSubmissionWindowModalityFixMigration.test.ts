import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/061_fix_planning_window_modality.sql", import.meta.url),
  "utf8",
);

describe("planning submission window modality fix", () => {
  it("uses the canonical Escolarizado value in the database trigger", () => {
    expect(migration).toContain("g.modalidad = 'Escolarizado'");
    expect(migration).not.toContain("g.modalidad = 'Escolarizada'");
  });
});
