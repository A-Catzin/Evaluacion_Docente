import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/123_student_comment_not_authorized.sql', 'utf8');

describe('migration 123: "no autorizado" student comments', () => {
  it('adds the flag with a safe default and forbids validated + rejected together', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS comentario_no_autorizado BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(sql).toMatch(/CHECK \(NOT \(comentario_validado AND comentario_no_autorizado\)\)/);
  });
  it('leaves the teacher-facing function alone, so teachers still read only validated comments', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
  });
});
