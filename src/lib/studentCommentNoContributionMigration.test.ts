import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/124_student_comment_no_contribution.sql', 'utf8');

describe('migration 124: "sin aporte" student comments', () => {
  it('adds the flag with a safe default', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS comentario_sin_aporte BOOLEAN NOT NULL DEFAULT FALSE/);
  });
  it('allows at most one review flag per comment, covering all three flags', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS encuesta_estudiantil_comentario_revision_chk/);
    for (const flag of ['comentario_validado', 'comentario_no_autorizado', 'comentario_sin_aporte']) expect(sql).toContain(`WHEN ${flag} THEN 1`);
    expect(sql).toMatch(/<= 1/);
  });
  it('does not touch the teacher-facing function', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
  });
});
