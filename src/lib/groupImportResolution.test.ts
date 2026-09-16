import { describe, expect, it } from "vitest";
import {
  groupImportIdentity,
  selectCanonicalEquivalentBaseCandidate,
  selectUniqueGroupCandidate,
} from "./groupImportResolution";

describe("group import resolution", () => {
  const base = {
    id: 1687,
    cuatrimestre_id: 11,
    plan_normalizado: "PRACTICA PROFESIONAL",
    grado: "9",
    grupo_normalizado: "27-1 PP ARQ D",
    asignatura_id: null,
  };

  it("selects one existing base even when grade is unavailable", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([{ ...base, grado: "" }])?.id,
    ).toBe(1687);
  });

  it("keeps multiple persisted base rows ambiguous rather than choosing one", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([
        base,
        { ...base, id: 1661, grado: "10" },
      ]),
    ).toBeUndefined();
  });

  it("does not treat assignment rows as bases", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([{ ...base, asignatura_id: 8 }]),
    ).toBeUndefined();
  });

  it("normalizes the cycle/plan/group identity without grade", () => {
    expect(
      groupImportIdentity(11, "Práctica profesional", "27_1 pp arq d"),
    ).toBe("11|PRACTICA PROFESIONAL|27 1 PP ARQ D");
  });

  it("returns only a genuinely unique arbitrary candidate", () => {
    expect(selectUniqueGroupCandidate([])).toBeUndefined();
    expect(selectUniqueGroupCandidate([{ id: 631 }])?.id).toBe(631);
    expect(
      selectUniqueGroupCandidate([{ id: 631 }, { id: 1209 }]),
    ).toBeUndefined();
  });
});
