export type PlanningStatusCounts = {
  approved: number;
  np: number;
  correction: number;
  review: number;
  pending: number;
};

/** Parses 'approved=1;np=2;pending=0;correction=1' as stored in calificaciones_finales.instrument_validity. */
export function parsePlanningStatusSummary(summary?: string | null): PlanningStatusCounts {
  const raw = Object.fromEntries(String(summary ?? "").split(";").map((part) => part.split("=")));
  const count = (key: string) => Number(raw[key]) || 0;
  return {
    approved: count("approved"),
    np: count("np"),
    correction: count("correction"),
    review: count("review"),
    pending: count("pending"),
  };
}

/**
 * Planning cell of a teacher row: the planning score when there is one, annotated with the
 * subjects that do not count ("85.50 (2 NP, 1 Corrección)"); otherwise the status itself
 * ("NP", "Corrección", "En revisión", "Pendiente").
 */
export function planningCellLabel(
  score: number | null | undefined,
  counts: PlanningStatusCounts,
  formatScore: (value: number | null | undefined) => string,
): string {
  if (score != null) {
    const notes = [
      counts.np ? `${counts.np} NP` : "",
      counts.correction ? `${counts.correction} Corrección` : "",
      counts.review ? `${counts.review} En revisión` : "",
    ].filter(Boolean);
    return notes.length ? `${formatScore(score)} (${notes.join(", ")})` : formatScore(score);
  }
  const labels = [
    counts.np ? "NP" : "",
    counts.correction ? "Corrección" : "",
    counts.review ? "En revisión" : "",
    counts.pending ? "Pendiente" : "",
  ].filter(Boolean);
  return labels.length ? labels.join(" / ") : formatScore(score);
}
