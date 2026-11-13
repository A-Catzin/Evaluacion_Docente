import { describe, expect, it } from 'vitest';
import { meetsStudentParticipation, STUDENT_PARTICIPATION_MIN_PERCENT } from './studentParticipation';

describe('meetsStudentParticipation', () => {
  it('uses a 20 % threshold', () => {
    expect(STUDENT_PARTICIPATION_MIN_PERCENT).toBe(20);
  });

  it('accepts exactly 20 % and rejects anything below', () => {
    expect(meetsStudentParticipation(1, 5)).toBe(true);
    expect(meetsStudentParticipation(5, 25)).toBe(true);
    expect(meetsStudentParticipation(4, 25)).toBe(false);
    expect(meetsStudentParticipation(0, 10)).toBe(false);
  });

  it('works for small groups', () => {
    expect(meetsStudentParticipation(1, 4)).toBe(true);
    expect(meetsStudentParticipation(1, 6)).toBe(false);
    expect(meetsStudentParticipation(1, 1)).toBe(true);
  });

  it('does not penalize a teacher without eligible students', () => {
    expect(meetsStudentParticipation(0, 0)).toBe(true);
    expect(meetsStudentParticipation(3, 0)).toBe(true);
  });
});

import { visibleStudentScore } from './studentParticipation';

describe('visibleStudentScore', () => {
  it('hides the detail when the teacher score was left out', () => {
    expect(visibleStudentScore(null, 100)).toBeUndefined();
    expect(visibleStudentScore(undefined, 100)).toBeUndefined();
  });

  it('shows the detail when the teacher score counts, including a valid 0', () => {
    expect(visibleStudentScore(87.5, 92)).toBe(92);
    expect(visibleStudentScore(0, 0)).toBe(0);
    expect(visibleStudentScore(80, undefined)).toBeUndefined();
  });
});
