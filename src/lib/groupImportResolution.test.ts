import { describe, expect, it } from "vitest";
import {
  selectCanonicalEquivalentBaseCandidate,
  selectUniqueGroupCandidate,
} from "./groupImportResolution";

describe("selectUniqueGroupCandidate", () => {
  it("devuelve undefined cuando no hay candidatos", () => {
    expect(selectUniqueGroupCandidate([])).toBeUndefined();
  });

  it("devuelve el único candidato", () => {
    const candidate = { id: 631 };
    expect(selectUniqueGroupCandidate([candidate])).toBe(candidate);
  });

  it("devuelve undefined cuando hay múltiples candidatos", () => {
    expect(
      selectUniqueGroupCandidate([{ id: 631 }, { id: 1209 }]),
    ).toBeUndefined();
  });
});

describe("selectCanonicalEquivalentBaseCandidate", () => {
  const base = {
    id: 1687,
    cuatrimestre_id: 11,
    plan_normalizado: "PRACTICA PROFESIONAL",
    grado: "9",
    grupo_normalizado: "27-1 PP ARQ D",
    asignatura_id: null,
    docente_id: null,
  };

  it("resuelve bases equivalentes al ID numérico más bajo", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([base, { ...base, id: 1661 }])?.id,
    ).toBe(1661);
  });

  it("conserva la ambigüedad cuando la identidad base difiere", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([
        base,
        { ...base, id: 1661, grado: "10" },
      ]),
    ).toBeUndefined();
  });

  it("no selecciona una base que ya tiene docente o asignatura", () => {
    expect(
      selectCanonicalEquivalentBaseCandidate([
        base,
        { ...base, id: 1661, docente_id: 55 },
      ]),
    ).toBeUndefined();
    expect(
      selectCanonicalEquivalentBaseCandidate([
        base,
        { ...base, id: 1661, asignatura_id: 8 },
      ]),
    ).toBeUndefined();
  });
});
