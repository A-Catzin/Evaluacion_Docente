export type InstrumentAnswerValue = number | "na";

export type InstrumentScoreSummary = {
  naCount: number;
  applicableItemCount: number;
  isInvalidExcessiveNa: boolean;
  rawScore: number | null;
  normalizedScore: number | null;
};

/** Computes from the definition supplied by the server; no fixed rubric length. */
export function summarizeInstrumentAnswers(
  values: InstrumentAnswerValue[],
  maxScore: number,
): InstrumentScoreSummary {
  const naCount = values.filter((value) => value === "na").length;
  const applicableItemCount = values.length;
  const answered = values.filter(
    (value): value is number => typeof value === "number",
  );
  const isInvalidExcessiveNa = naCount * 100 > applicableItemCount * 20;
  const rawScore = answered.length
    ? answered.reduce((total, value) => total + value, 0) / answered.length
    : null;
  const normalizedScore =
    !isInvalidExcessiveNa && answered.length && maxScore > 0
      ? Math.round((answered.reduce((total, value) => total + value, 0) / (answered.length * maxScore)) * 10000) / 100
      : null;
  return { naCount, applicableItemCount, isInvalidExcessiveNa, rawScore, normalizedScore };
}
