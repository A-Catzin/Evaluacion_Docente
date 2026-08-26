import { describe, expect, it } from "vitest";
import {
  parseTestCycleDeletionRequest,
  parseTestCycleId,
} from "./testCycleDeletion";

describe("test cycle deletion request", () => {
  it("requires a positive integer id and a non-empty exact-confirmation candidate", () => {
    expect(parseTestCycleDeletionRequest({ id: 12, confirmation: "26-1 - Pruebas" })).toEqual({
      ok: true,
      value: { id: 12, confirmation: "26-1 - Pruebas" },
    });
    expect(parseTestCycleDeletionRequest({ id: "12", confirmation: "26-1 - Pruebas" })).toMatchObject({ ok: false });
    expect(parseTestCycleDeletionRequest({ id: 12, confirmation: "" })).toMatchObject({ ok: false });
  });

  it("does not normalize the confirmation supplied to the server", () => {
    expect(parseTestCycleDeletionRequest({ id: 12, confirmation: " 26-1 - Pruebas " })).toEqual({
      ok: true,
      value: { id: 12, confirmation: " 26-1 - Pruebas " },
    });
  });

  it("validates preview and test-marking cycle ids independently", () => {
    expect(parseTestCycleId({ id: 4 })).toEqual({ ok: true, value: 4 });
    expect(parseTestCycleId({ id: 0 })).toMatchObject({ ok: false });
  });
});
