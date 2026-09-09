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

  it("uses the canonical group identity in assignment keys", () => {
    expect(assignmentImportKey(7, "Plan A", "1", "A_1", "MAT-01")).toBe(
      "7|PLAN A|1|A 1|MAT-01",
    );
  });
});
