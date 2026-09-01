import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./VersionedInstrumentCapture.astro", import.meta.url), "utf8");

describe("VersionedInstrumentCapture", () => {
  it("renders definition-provided sections and computes N/A state from their real size", () => {
    expect(component).toContain("definition.sections.map");
    expect(component).toContain("section.items.map");
    expect(component).toContain("definition.sections.reduce");
    expect(component).toContain("naCount * 100 > total * 20");
    expect(component).not.toContain("/ 61");
  });

  it("shows N/A only when configured and requires evidence and feedback", () => {
    expect(component).toContain("item.na_eligible");
    expect(component).toContain("Cada N/A requiere un motivo");
    expect(component).toContain("data-evidence");
    expect(component).toContain("metadata-recommendation");
  });
});
