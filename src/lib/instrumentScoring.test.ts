import { describe, expect, it } from "vitest";
import { summarizeInstrumentAnswers } from "./instrumentScoring";

describe("summarizeInstrumentAnswers", () => {
  it("accepts exactly twenty percent N/A", () => {
    const result = summarizeInstrumentAnswers([2, 2, 2, 2, "na"], 2);
    expect(result.isInvalidExcessiveNa).toBe(false);
    expect(result.normalizedScore).toBe(100);
  });

  it("invalidates only above twenty percent and excludes N/A from the denominator", () => {
    const result = summarizeInstrumentAnswers([2, 2, 2, "na", "na"], 2);
    expect(result.naCount).toBe(2);
    expect(result.applicableItemCount).toBe(5);
    expect(result.isInvalidExcessiveNa).toBe(true);
    expect(result.normalizedScore).toBeNull();
  });

  it("uses the supplied item count instead of a hardcoded denominator", () => {
    const values = Array.from({ length: 61 }, (_, index) => (index < 12 ? "na" : 2)) as Array<2 | "na">;
    expect(summarizeInstrumentAnswers(values, 2).isInvalidExcessiveNa).toBe(false);
  });
});
