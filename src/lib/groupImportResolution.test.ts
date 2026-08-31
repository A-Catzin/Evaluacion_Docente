import { describe, expect, it } from "vitest";
import { selectUniqueGroupCandidate } from "./groupImportResolution";

describe("selectUniqueGroupCandidate", () => {
  it("devuelve undefined cuando no hay candidatos", () => {
    expect(selectUniqueGroupCandidate([])).toBeUndefined();
  });

  it("devuelve el único candidato", () => {
    const candidate = { id: 631 };
    expect(selectUniqueGroupCandidate([candidate])).toBe(candidate);
  });

  it("devuelve undefined cuando hay múltiples candidatos", () => {
    expect(selectUniqueGroupCandidate([{ id: 631 }, { id: 1209 }])).toBeUndefined();
  });
});
