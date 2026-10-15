import { describe, expect, it } from "vitest";
import {
  instrumentSubmissionMessage,
  instrumentSubmissionWindowFromRpc,
  parseInstrumentSubmissionWindowInput,
  parseCancunDateTimeLocal,
} from "./instrumentSubmissionWindow";

describe("instrument submission windows", () => {
  it("fails closed for missing or malformed RPC state", () => {
    expect(instrumentSubmissionWindowFromRpc(null)).toMatchObject({
      configured: false,
      state: "not_configured",
    });
    expect(
      instrumentSubmissionWindowFromRpc({ state: "unexpected" }).state,
    ).toBe("not_configured");
  });

  it("uses Spanish unavailable messages for each independent purpose", () => {
    expect(
      instrumentSubmissionMessage("coordination", {
        configured: false,
        mode: null,
        opens_at: null,
        closes_at: null,
        state: "not_configured",
      }),
    ).toContain("evaluación por coordinación");
    expect(
      instrumentSubmissionMessage("observation", {
        configured: true,
        mode: "scheduled",
        opens_at: "2026-08-16T14:00:00.000Z",
        closes_at: "2026-08-30T14:00:00.000Z",
        state: "scheduled_ended",
      }),
    ).toContain("finalizó");
  });

  it("parses scheduled Cancun times and rejects invalid purpose or bounds", () => {
    expect(parseCancunDateTimeLocal("2026-08-16T09:00")?.toISOString()).toBe(
      "2026-08-16T14:00:00.000Z",
    );
    expect(
      parseInstrumentSubmissionWindowInput({
        cuatrimestre_id: 11,
        purpose: "observation",
        mode: "scheduled",
        opens_at: "2026-08-30T09:00",
        closes_at: "2026-08-16T09:00",
      }).ok,
    ).toBe(false);
    expect(
      parseInstrumentSubmissionWindowInput({
        cuatrimestre_id: 11,
        purpose: "planning",
        mode: "manual_open",
      }).ok,
    ).toBe(false);
  });
});
