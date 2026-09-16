import { describe, expect, it } from "vitest";
import {
  autodiagnosticoSubmissionMessage,
  autodiagnosticoWindowFromRpc,
  formatCancunDateTimeLocal,
  parseAutodiagnosticoWindowInput,
  parseCancunDateTimeLocal,
  requireTeacherAutodiagnosticoSubmissionOpen,
} from "./autodiagnosticoSubmissionWindow";

describe("autodiagnostico submission window state", () => {
  it("fails closed when the state RPC returns no usable row", () => {
    expect(autodiagnosticoWindowFromRpc(null)).toMatchObject({
      configured: false,
      state: "not_configured",
    });
    expect(autodiagnosticoWindowFromRpc({ state: "unexpected" }).state).toBe(
      "not_configured",
    );
  });

  it("returns a safe JSON 403 when the state lookup is rejected", async () => {
    const response = await requireTeacherAutodiagnosticoSubmissionOpen(
      {
        rpc: async () => ({ data: null, error: new Error("database detail") }),
      } as any,
      11,
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({
      error:
        "La autoevaluación docente no está habilitada para este cuatrimestre.",
      code: "autodiagnostico_submissions_closed",
    });
  });

  it("uses teacher-facing messages for unavailable scheduled states", () => {
    const pending = {
      configured: true,
      mode: "scheduled" as const,
      opens_at: "2026-08-16T14:00:00.000Z",
      closes_at: "2026-08-30T14:00:00.000Z",
      state: "scheduled_pending" as const,
    };
    expect(autodiagnosticoSubmissionMessage(pending)).toContain(
      "estará disponible",
    );
    expect(
      autodiagnosticoSubmissionMessage({
        ...pending,
        state: "scheduled_ended",
      }),
    ).toContain("finalizó");
    expect(
      autodiagnosticoSubmissionMessage({ ...pending, state: "not_configured" }),
    ).toContain("no está habilitada");
  });
});

describe("autodiagnostico window timestamps and input", () => {
  it("interprets datetime-local inputs and output in America/Cancun", () => {
    expect(parseCancunDateTimeLocal("2026-08-16T09:00")?.toISOString()).toBe(
      "2026-08-16T14:00:00.000Z",
    );
    expect(formatCancunDateTimeLocal("2026-01-01T04:30:00.000Z")).toBe(
      "2025-12-31T23:30",
    );
  });

  it("rejects malformed IDs, impossible local dates, and non-increasing schedules", () => {
    expect(
      parseAutodiagnosticoWindowInput({
        cuatrimestre_id: "4x",
        mode: "manual_open",
      }).ok,
    ).toBe(false);
    expect(parseCancunDateTimeLocal("2026-02-30T09:00")).toBeNull();
    expect(
      parseAutodiagnosticoWindowInput({
        cuatrimestre_id: 4,
        mode: "scheduled",
        opens_at: "2026-08-30T09:00",
        closes_at: "2026-08-16T09:00",
      }).ok,
    ).toBe(false);
  });
});
