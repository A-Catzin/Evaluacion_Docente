import { describe, expect, it } from "vitest";
import {
  assignmentImportKey,
  baseImportedGroup,
  normalizeImportedGroup,
} from "./groupImportIdentity";

describe("group import identity", () => {
  it("matches student-import underscores and assignment-import base labels", () => {
    expect(normalizeImportedGroup(" Á_1  ")).toBe("A 1");
    expect(baseImportedGroup("A_1 - Matemáticas")).toBe("A 1");
  });

  it("uses cycle, plan, group and subject key without grade", () => {
    expect(assignmentImportKey(7, "Plan A", "A_1", "MAT-01")).toBe(
      "7|PLAN A|A 1|MAT-01",
    );
    // Legacy callers may still pass grade, but it cannot split identity.
    expect(assignmentImportKey(7, "Plan A", "9", "A_1", "MAT-01")).toBe(
      "7|PLAN A|A 1|MAT-01",
    );
  });
});
