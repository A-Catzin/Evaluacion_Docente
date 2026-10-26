import { describe, expect, it } from "vitest";
import { getPlanningSubjectStatus } from "./planningSubjectStatus";
import { calculateSubjectAwareFinal } from "../services/scoring";

const scope = { key: "regimen fiscal", assignments: [] };
const plan = (estado: string) => [{ asignaturaNombre: "Regimen Fiscal", estado }];

describe("planning status 'Corrección'", () => {
  it("is its own status, after approved and NP; an uploaded plan waiting for review is 'review'", () => {
    expect(getPlanningSubjectStatus(scope, plan("Corrección"), [])).toBe("correction");
    expect(getPlanningSubjectStatus(scope, plan("Aprobado"), [])).toBe("approved");
    expect(getPlanningSubjectStatus(scope, [], [{ subject_key: "regimen fiscal", estado: "NP" }])).toBe("np");
    expect(getPlanningSubjectStatus(scope, plan("Pendiente"), [])).toBe("review");
    expect(getPlanningSubjectStatus(scope, [], [])).toBe("pending");
  });

  it("is left out of the grade like NP: four-instrument profile, no zero for planning", () => {
    const common = { ee: 90, coord: 100, obs: 100, auto: 100 };
    const result = calculateSubjectAwareFinal([
      { ...common, key: "a", nombre: "A", grupos: ["1"], planningStatus: "correction", plan: 71 },
      { ...common, key: "b", nombre: "B", grupos: ["2"], planningStatus: "np" },
    ]);
    expect(result.aggregate.plan).toBeUndefined();
    expect(result.final).toMatchObject({ final: 96, instrumentCount: 4, expectedInstrumentCount: 4 });
  });

  it("does not hide a pending plan: pending still counts as zero", () => {
    const common = { ee: 90, coord: 100, obs: 100, auto: 100 };
    const result = calculateSubjectAwareFinal([
      { ...common, key: "a", nombre: "A", grupos: ["1"], planningStatus: "correction" },
      { ...common, key: "b", nombre: "B", grupos: ["2"], planningStatus: "pending" },
    ]);
    expect(result.aggregate.plan).toBe(0);
    expect(result.final.expectedInstrumentCount).toBe(5);
  });
});
