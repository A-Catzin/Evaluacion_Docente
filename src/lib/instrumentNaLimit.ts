/** More than this share of N/A answers makes an instrument invalid (same rule as the database function). */
export const NA_LIMIT_PERCENT = 20;

export function hasExcessiveNa(naCount: number, totalItems: number): boolean {
  return naCount * 100 > totalItems * NA_LIMIT_PERCENT;
}

/** Highest number of N/A answers that still keeps the instrument valid. */
export function maxAllowedNa(totalItems: number): number {
  return Math.floor((totalItems * NA_LIMIT_PERCENT) / 100);
}

/**
 * Coordination and observation captures are blocked when they exceed the limit, instead of being
 * saved as invalid. Planning keeps its own flow: excessive N/A sends it back for correction.
 */
export function excessiveNaMessage(naCount: number, totalItems: number): string {
  return `Hay demasiadas respuestas N/A (${naCount} de ${totalItems}). Máximo permitido: ${maxAllowedNa(totalItems)} (${NA_LIMIT_PERCENT}%). Contesta más criterios para poder enviar.`;
}
