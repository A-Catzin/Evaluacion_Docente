import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/102_legacy_observation_reevaluation.sql", import.meta.url),
  "utf8",
);

describe("legacy observation reevaluation migration", () => {
  it("adds legacy observation codes to every revision function without changing initial captures", () => {
    expect(migration).toContain("observation_escolarizado");
    expect(migration).toContain("observation_virtual");
    expect(migration).toContain("observation_ejecutivo");
    expect(migration).toContain("guard_new_observation_revision");
    expect(migration).toContain("reevaluate_observation_instrument");
    expect(migration).toContain("get_observation_revision_state");
    expect(migration).toContain("save_observation_revision_draft");
    expect(migration).toContain("delete_observation_revision_draft");
    expect(migration).toContain("linked revision rows");
  });
});
