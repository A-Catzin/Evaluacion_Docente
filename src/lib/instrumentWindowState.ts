import type {
  InstrumentSubmissionMode,
  InstrumentSubmissionState,
} from "./instrumentSubmissionWindow";

export type InstrumentWindowRow = {
  purpose: string;
  mode: InstrumentSubmissionMode;
  opens_at: string | null;
  closes_at: string | null;
};

/** Mirrors `instrument_submission_window_effective_state` in the database. */
export function effectiveWindowState(
  row: Pick<InstrumentWindowRow, "mode" | "opens_at" | "closes_at"> | null | undefined,
  now: Date = new Date(),
): InstrumentSubmissionState {
  if (!row) return "not_configured";
  if (row.mode === "manual_open") return "open";
  if (row.mode === "manual_closed") return "closed";
  const opens = row.opens_at ? new Date(row.opens_at).getTime() : Number.NaN;
  const closes = row.closes_at ? new Date(row.closes_at).getTime() : Number.NaN;
  if (Number.isNaN(opens) || Number.isNaN(closes)) return "closed";
  if (now.getTime() < opens) return "scheduled_pending";
  if (now.getTime() >= closes) return "scheduled_ended";
  return "open";
}

/**
 * The student survey predates its window, so it stays open until a window is
 * configured. Any configured window that is not open blocks new submissions.
 */
export function studentSurveyAcceptsSubmissions(
  row: Pick<InstrumentWindowRow, "mode" | "opens_at" | "closes_at"> | null | undefined,
  now: Date = new Date(),
): boolean {
  const state = effectiveWindowState(row, now);
  return state === "not_configured" || state === "open";
}
