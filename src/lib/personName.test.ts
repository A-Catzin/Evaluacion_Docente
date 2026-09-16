import { describe, expect, it } from "vitest";
import { formatPersonName } from "./personName";

describe("formatPersonName", () => {
  it("uppercases Spanish names while preserving diacritics", () => {
    expect(formatPersonName("Burgos Magaña")).toBe("BURGOS MAGAÑA");
  });

  it("returns an empty string for nullish and empty values", () => {
    expect(formatPersonName(null)).toBe("");
    expect(formatPersonName(undefined)).toBe("");
    expect(formatPersonName("")).toBe("");
  });

  it("handles already composed full names", () => {
    expect(formatPersonName("María del Carmen Ñúñez")).toBe(
      "MARÍA DEL CARMEN ÑÚÑEZ",
    );
  });
});
