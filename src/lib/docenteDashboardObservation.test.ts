import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  new URL("../pages/docente/dashboard.astro", import.meta.url),
  "utf8",
);

describe("docente dashboard observation feedback", () => {
  it("loads versioned answers and evidence for identity-linked docente records", () => {
    expect(dashboard).toContain("const docenteIdsAutorizados: number[]");
    expect(dashboard).toContain("from('instrument_submissions')");
    expect(dashboard).toContain("from('instrument_answers')");
    expect(dashboard).toContain("from('instrument_evidence')");
    expect(dashboard).toContain(".in('docente_id', docenteIdsAutorizados)");
    expect(dashboard).toContain("buildVersionedObservationFeedback");
  });

  it("renders the versioned observation snapshot, section evidence, and comments", () => {
    expect(dashboard).toContain("versionedObsFeedback.map");
    expect(dashboard).toContain("entry.evidenceBySection");
    expect(dashboard).toContain("metadata.strengths");
    expect(dashboard).toContain("metadata.general_observations");
    expect(dashboard).toContain("versionedObservationAnswerLabel");
  });
});
