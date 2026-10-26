import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/121_coordination_instrument_drafts.sql", "utf8");
const component = readFileSync("src/components/VersionedInstrumentCapture.astro", "utf8");
const api = readFileSync("src/pages/api/instrumentos/draft.ts", "utf8");

describe("coordination instrument drafts", () => {
  it("authorizes by coordinated-teacher assignment and discards drafts on final submission", () => {
    expect(migration).toContain("can_manage_coordinated_teacher");
    expect(migration).toContain("d.purpose = 'coordination'");
    expect(migration).toContain("NEW.purpose IN ('observation', 'coordination')");
    expect(migration).toContain("TO authenticated");
  });

  it("routes the draft API by purpose without changing the observation RPCs", () => {
    expect(api).toContain('rpcName("save", parsed.data.purpose)');
    expect(api).toContain('purpose === "coordination" ? "coordination" : "observation"');
  });

  it("saves, restores and clears the administrative checklist in the client", () => {
    expect(component).toContain("const hasDraft = isObservation || isCoordination");
    expect(component).toContain('params.set("purpose", "coordination")');
    expect(component).toContain("checks: Array.from(form.querySelectorAll(\"[data-check]\"))");
  });
});

describe("draft answer scale", () => {
  it("accepts every level of the 5-point coordination scale", async () => {
    const { SaveDraftSchema } = await import("../pages/api/instrumentos/draft");
    const base = { docente_id: 336, cuatrimestre_id: 11, version_id: "4bed8d0a-aa77-4981-b21d-d1188db5d39e", purpose: "coordination" };
    const item_id = "c9ca6779-b5a4-4706-8ab0-9f82997291ed";
    for (const value of [1, 2, 3, 4, 5]) expect(SaveDraftSchema.safeParse({ ...base, draft: { answers: [{ item_id, value }] } }).success).toBe(true);
    expect(SaveDraftSchema.safeParse({ ...base, draft: { answers: [{ item_id, value: 6 }] } }).success).toBe(false);
  });
});
