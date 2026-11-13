import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/126_student_survey_submission_window.sql', 'utf8');

describe('migration 126 student survey window', () => {
  it('allows the student_survey purpose in the table and the save function', () => {
    expect(sql).toContain("CHECK (purpose IN ('coordination', 'observation', 'student_survey'))");
    expect(sql).toContain("OR p_purpose NOT IN ('coordination', 'observation', 'student_survey')");
  });

  it('keeps the superadmin guard and does not seed a closed window', () => {
    expect(sql).toContain('IF NOT public.audit_is_superadmin()');
    expect(sql).not.toMatch(/INSERT INTO public\.instrument_submission_windows \([^)]*\)\s*SELECT/);
  });
});
