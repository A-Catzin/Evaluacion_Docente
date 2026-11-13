import { describe, expect, it } from 'vitest';
import { effectiveWindowState, studentSurveyAcceptsSubmissions } from './instrumentWindowState';

const now = new Date('2026-11-10T12:00:00Z');
const scheduled = (opens_at: string, closes_at: string) => ({ mode: 'scheduled' as const, opens_at, closes_at });

describe('effectiveWindowState', () => {
  it('is not configured without a row and follows manual modes', () => {
    expect(effectiveWindowState(null, now)).toBe('not_configured');
    expect(effectiveWindowState({ mode: 'manual_open', opens_at: null, closes_at: null }, now)).toBe('open');
    expect(effectiveWindowState({ mode: 'manual_closed', opens_at: null, closes_at: null }, now)).toBe('closed');
  });

  it('follows the schedule, closing exactly at the end', () => {
    expect(effectiveWindowState(scheduled('2026-11-11T00:00:00Z', '2026-11-20T00:00:00Z'), now)).toBe('scheduled_pending');
    expect(effectiveWindowState(scheduled('2026-11-01T00:00:00Z', '2026-11-20T00:00:00Z'), now)).toBe('open');
    expect(effectiveWindowState(scheduled('2026-11-01T00:00:00Z', '2026-11-10T12:00:00Z'), now)).toBe('scheduled_ended');
  });
});

describe('studentSurveyAcceptsSubmissions', () => {
  it('keeps the survey open until a window is configured', () => {
    expect(studentSurveyAcceptsSubmissions(null, now)).toBe(true);
  });

  it('blocks a configured window that is closed, pending or ended', () => {
    expect(studentSurveyAcceptsSubmissions({ mode: 'manual_closed', opens_at: null, closes_at: null }, now)).toBe(false);
    expect(studentSurveyAcceptsSubmissions(scheduled('2026-11-11T00:00:00Z', '2026-11-20T00:00:00Z'), now)).toBe(false);
    expect(studentSurveyAcceptsSubmissions(scheduled('2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z'), now)).toBe(false);
    expect(studentSurveyAcceptsSubmissions({ mode: 'manual_open', opens_at: null, closes_at: null }, now)).toBe(true);
  });
});
