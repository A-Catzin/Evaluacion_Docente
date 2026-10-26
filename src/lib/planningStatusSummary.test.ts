import { describe, expect, it } from "vitest";
import { parsePlanningStatusSummary, planningCellLabel } from "./planningStatusSummary";

const fmt = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(2));
const cell = (score: number | null, summary: string) => planningCellLabel(score, parsePlanningStatusSummary(summary), fmt);

describe("planning cell label", () => {
  it("parses the stored summary, including the optional statuses", () => {
    expect(parsePlanningStatusSummary("approved=1;np=2;pending=0;correction=1;review=3")).toEqual({
      approved: 1, np: 2, correction: 1, review: 3, pending: 0,
    });
    expect(parsePlanningStatusSummary(undefined)).toEqual({ approved: 0, np: 0, correction: 0, review: 0, pending: 0 });
  });

  it("shows the status when there is no planning score", () => {
    expect(cell(null, "approved=0;np=2;pending=0")).toBe("NP");
    expect(cell(null, "approved=0;np=0;pending=0;correction=1")).toBe("Corrección");
    expect(cell(null, "approved=0;np=1;pending=0;review=1")).toBe("NP / En revisión");
    expect(cell(null, "approved=0;np=1;pending=1")).toBe("NP / Pendiente");
  });

  it("annotates the score with the subjects that do not count", () => {
    expect(cell(85.5, "approved=2;np=2;pending=0")).toBe("85.50 (2 NP)");
    expect(cell(85.5, "approved=1;np=1;pending=0;correction=1;review=1")).toBe("85.50 (1 NP, 1 Corrección, 1 En revisión)");
  });

  it("leaves a plain score or an empty cell alone", () => {
    expect(cell(90, "approved=2;np=0;pending=0")).toBe("90.00");
    expect(cell(null, "")).toBe("—");
  });
});
