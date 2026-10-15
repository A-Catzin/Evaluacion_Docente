import { describe, expect, it } from "vitest";
import { resolveCoordinatorCycle } from "./coordinatorCycle";

const catalog = [{ id: 12 }, { id: 11 }];

describe("resolveCoordinatorCycle", () => {
  it("uses query, cookie, active cycle, and catalog in priority order", () => {
    expect(
      resolveCoordinatorCycle({
        query: "12",
        cookie: "11",
        active: 11,
        catalog,
      }),
    ).toBe(12);
    expect(resolveCoordinatorCycle({ cookie: "11", active: 12, catalog })).toBe(11);
    expect(resolveCoordinatorCycle({ active: 11, catalog })).toBe(11);
    expect(resolveCoordinatorCycle({ catalog })).toBe(12);
  });

  it("rejects malformed, non-positive, unsafe, and unknown cycle IDs", () => {
    expect(
      resolveCoordinatorCycle({
        query: "12cycles",
        cookie: "0",
        active: Number.MAX_SAFE_INTEGER + 1,
        catalog,
      }),
    ).toBe(12);
    expect(resolveCoordinatorCycle({ query: "13", cookie: "11", catalog })).toBe(11);
    expect(resolveCoordinatorCycle({ query: "-1", catalog })).toBe(12);
  });

  it("retains positive inputs when the catalog is unavailable and otherwise falls back to zero", () => {
    expect(resolveCoordinatorCycle({ query: "11", catalog: [] })).toBe(11);
    expect(resolveCoordinatorCycle({ cookie: "12", catalog: [] })).toBe(12);
    expect(resolveCoordinatorCycle({ active: 13, catalog: [] })).toBe(13);
    expect(resolveCoordinatorCycle({ query: "13", catalog })).toBe(12);
    expect(resolveCoordinatorCycle({ catalog: [] })).toBe(0);
  });
});
