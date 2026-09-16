import { describe, expect, it } from "vitest";
import {
  formatPlanningSubmissionDate,
  parseCancunDateTimeLocal,
  parsePlanningWindowInput,
  MAX_PLANNING_PDF_BYTES,
  planningSubmissionMessage,
  planningWindowFromRpc,
  validatePlanningPdf,
} from "./planningSubmissionWindow";

describe("planning submission window state", () => {
  it("fails closed when the state RPC returns no usable row", () => {
    expect(planningWindowFromRpc(null)).toMatchObject({
      configured: false,
      state: "not_configured",
    });
  });

  it("maps scheduled states to neutral Spanish messages", () => {
    const pending = {
      configured: true,
      mode: "scheduled" as const,
      opens_at: "2026-08-16T14:00:00.000Z",
      closes_at: "2026-08-30T14:00:00.000Z",
      state: "scheduled_pending" as const,
    };
    const ended = { ...pending, state: "scheduled_ended" as const };
    expect(planningSubmissionMessage(pending)).toContain("estará disponible");
    expect(planningSubmissionMessage(ended)).toContain("finalizó");
  });
});

describe("planning submission timestamps", () => {
  it("formats UTC instants around midnight in the previous Cancun calendar date", () => {
    expect(formatPlanningSubmissionDate("2026-01-01T04:30:00.000Z")).toBe(
      "31/12/25, 11:30 p.m.",
    );
  });
});

describe("planning window input", () => {
  it("parses datetime-local values as America/Cancun rather than the host timezone", () => {
    expect(parseCancunDateTimeLocal("2026-08-16T09:00")?.toISOString()).toBe(
      "2026-08-16T14:00:00.000Z",
    );
  });

  it("rejects invalid scheduled bounds and malformed cycle IDs", () => {
    expect(
      parsePlanningWindowInput({ cuatrimestre_id: "4x", mode: "manual_open" })
        .ok,
    ).toBe(false);
    expect(
      parsePlanningWindowInput({
        cuatrimestre_id: 4,
        mode: "scheduled",
        opens_at: "2026-08-30T09:00",
        closes_at: "2026-08-16T09:00",
      }).ok,
    ).toBe(false);
  });

  it("requires matching PDF MIME type, extension, and a 30 MiB maximum", () => {
    expect(MAX_PLANNING_PDF_BYTES).toBe(30 * 1024 * 1024);
    expect(
      validatePlanningPdf(
        new File(["pdf"], "plan.pdf", { type: "application/pdf" }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      validatePlanningPdf(
        new File([new Uint8Array(MAX_PLANNING_PDF_BYTES)], "plan.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      validatePlanningPdf(
        new File(["pdf"], "plan.exe", { type: "application/pdf" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      validatePlanningPdf(
        new File(["pdf"], "plan.pdf", { type: "text/plain" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      validatePlanningPdf(
        new File([new Uint8Array(MAX_PLANNING_PDF_BYTES + 1)], "plan.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toMatchObject({ ok: false });
  });
});
