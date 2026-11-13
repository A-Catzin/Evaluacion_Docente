/** Share of eligible students that must answer before the student score enters the 360 result. */
export const STUDENT_PARTICIPATION_MIN_PERCENT = 20;

/**
 * Whether a teacher's student score is representative. Integer arithmetic keeps
 * the boundary exact: 1 of 5 students is exactly 20 %. A teacher whose eligible
 * count dropped to zero (all students withdrawn) is never penalized.
 */
export function meetsStudentParticipation(
  responses: number,
  eligible: number,
  minPercent: number = STUDENT_PARTICIPATION_MIN_PERCENT,
): boolean {
  if (eligible <= 0) return true;
  return responses * 100 >= eligible * minPercent;
}

/**
 * Group or subject student scores are detail of the teacher's result. When the
 * teacher-level score was left out (participation below the minimum), the detail
 * must not be shown either, or reports would contradict the official result.
 */
export function visibleStudentScore<T>(
  teacherScore: number | null | undefined,
  detailScore: T | null | undefined,
): T | undefined {
  return teacherScore == null ? undefined : (detailScore ?? undefined);
}
