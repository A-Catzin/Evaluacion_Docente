import { describe, expect, it } from "vitest";
import { planObservationAllocation } from "./observationAllocation";

describe("observation allocation policy", () => {
  it("fills explicit targets first, then distributes the remainder evenly", () => {
    const plan = planObservationAllocation(
      Array.from({ length: 24 }, (_, index) => index + 1),
      [
        { evaluatorId: "target-a", included: true, targetTeacherCount: 4, currentCount: 0 },
        { evaluatorId: "target-b", included: true, targetTeacherCount: 6, currentCount: 0 },
        { evaluatorId: "remainder-a", included: true, targetTeacherCount: null, currentCount: 0 },
        { evaluatorId: "remainder-b", included: true, targetTeacherCount: null, currentCount: 0 },
      ],
      "allocation-24",
    );

    expect(plan["target-a"].final).toBe(4);
    expect(plan["target-b"].final).toBe(6);
    expect(plan["remainder-a"].proposedTeacherIds).toHaveLength(7);
    expect(plan["remainder-b"].proposedTeacherIds).toHaveLength(7);
  });

  it("keeps existing assignments fixed and flags an evaluator already over target", () => {
    const plan = planObservationAllocation(
      [10, 11],
      [{ evaluatorId: "over-target", included: true, targetTeacherCount: 2, currentCount: 4 }],
      "fixed-existing",
    );

    expect(plan["over-target"]).toMatchObject({ current: 4, final: 4, exceedsTarget: true, proposedTeacherIds: [] });
  });

  it("never allocates automatically to excluded evaluators", () => {
    const plan = planObservationAllocation(
      [1, 2, 3],
      [
        { evaluatorId: "included", included: true, targetTeacherCount: null, currentCount: 0 },
        { evaluatorId: "excluded", included: false, targetTeacherCount: null, currentCount: 3 },
      ],
      "excluded",
    );

    expect(plan.included.proposedTeacherIds).toHaveLength(3);
    expect(plan.excluded.proposedTeacherIds).toHaveLength(0);
    expect(plan.excluded.final).toBe(3);
  });

  it("is deterministic for a stored seed and balances no-target final loads when possible", () => {
    const evaluators = [
      { evaluatorId: "a", included: true, targetTeacherCount: null, currentCount: 1 },
      { evaluatorId: "b", included: true, targetTeacherCount: null, currentCount: 1 },
      { evaluatorId: "c", included: true, targetTeacherCount: null, currentCount: 1 },
    ];
    const first = planObservationAllocation([1, 2, 3, 4, 5], evaluators, "persisted-seed");
    const second = planObservationAllocation([1, 2, 3, 4, 5], evaluators, "persisted-seed");

    expect(first).toEqual(second);
    const finalCounts = Object.values(first).map((item) => item.final);
    expect(Math.max(...finalCounts) - Math.min(...finalCounts)).toBeLessThanOrEqual(1);
  });
});
