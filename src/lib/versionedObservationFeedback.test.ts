import { describe, expect, it } from "vitest";
import { buildVersionedObservationFeedback } from "./versionedObservationFeedback";

describe("versioned observation feedback", () => {
  it("groups answers and section evidence by immutable submission id", () => {
    const result = buildVersionedObservationFeedback(
      [
        { id: "submission-1", definition_snapshot: { sections: [] } },
        { id: "submission-2", definition_snapshot: { sections: [] } },
      ],
      [
        { submission_id: "submission-1", item_id: "item-a", numeric_value: 2, is_na: false },
        { submission_id: "submission-2", item_id: "item-b", numeric_value: null, is_na: true, na_reason: "No observable" },
      ],
      [
        { submission_id: "submission-1", section_id: "section-a", evidence: "Evidence A" },
        { submission_id: "submission-2", section_id: "section-b", evidence: "Evidence B" },
      ],
    );

    expect(result).toHaveLength(2);
    expect(result[0].answersByItem["item-a"]?.numeric_value).toBe(2);
    expect(result[0].evidenceBySection).toEqual({ "section-a": "Evidence A" });
    expect(result[1].answersByItem["item-b"]?.is_na).toBe(true);
    expect(result[1].evidenceBySection).toEqual({ "section-b": "Evidence B" });
  });

  it("does not expose evidence entries without text", () => {
    const result = buildVersionedObservationFeedback(
      [{ id: "submission-1" }],
      [],
      [{ submission_id: "submission-1", section_id: "section-a", evidence: null }],
    );

    expect(result[0].evidenceBySection).toEqual({});
  });
});
