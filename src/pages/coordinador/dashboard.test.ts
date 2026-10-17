import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("coordinator observation dashboard", () => {
  it("counts versioned observation submissions as completed", async () => {
    const source = await readFile(
      new URL("./dashboard.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain("from('instrument_submissions')");
    expect(source).toContain("eq('purpose', 'observation')");
    expect(source).toContain("completedObservationTeacherIds");
    expect(source).toContain("normalized_score");
    expect(source).toContain("formatScore(portfolioRow.observationScore)");
  });

  it("offers reevaluation after an observation is completed", async () => {
    const source = await readFile(
      new URL("./dashboard.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain("Observación realizada");
    expect(source).toContain("'Reevaluar'");
    expect(source).toContain("'Iniciar observación'");
  });

  it("scopes observation completion and displayed score to the actor even when another actor supersedes it", async () => {
const source = await readFile(new URL("./dashboard.astro", import.meta.url), "utf8");

expect(source).toMatch(/instrument_submissions[\s\S]*?\.select\(['"][^'"]*submitted_by[^'"]*['"]\)/);
expect(source).toMatch(/from\(['"]observaciones['"]\)\.select\(['"][^'"]*evaluador_id[^'"]*['"]\)/);
expect(source).toMatch(/summarizeObserverObservations\([\s\S]*?actorId,?\s*\)/);
expect(source).toContain("summary.ownLatestScores");
expect(source).toContain("summary.completedTeacherIds");
expect(source).toMatch(/supersededTeacherIds\.has\(card\.teacher\.id\)[\s\S]*?Reevaluar/);
  });
});
