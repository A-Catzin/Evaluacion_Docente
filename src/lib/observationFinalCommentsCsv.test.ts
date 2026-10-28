import { describe, expect, it } from 'vitest';
import { observationFinalCommentsCsv, OBSERVATION_COMMENT_HEADER, type ObservationCommentSubmission } from './observationFinalCommentsCsv';

const base: ObservationCommentSubmission = {
  id: 'a', docente_id: 1, asignatura_id: 10, grupo: '27-1 A', submitted_by: 'u1', submitted_at: '2026-10-17T17:12:50Z',
  normalized_score: 90, validity_status: 'valid', supersedes_submission_id: null,
  metadata: { strengths: ' Buen dominio ', priority_area: 'Tiempos', recommendation: 'Planear "mejor"', general_observations: '=1+1' },
};
const teachers = new Map([[1, { name: 'Ana Pérez', email: 'ana@x.mx' }], [2, { name: 'Beto Ruiz', email: null }]]);
const subjects = new Map([[10, 'ÁLGEBRA']]);
const observers = new Map([[1, ['obs@x.mx']], [2, ['obs@x.mx']]]);

describe('observation final comments CSV', () => {
  it('writes one row with the four closing comments, trimmed and escaped', () => {
    const csv = observationFinalCommentsCsv([base], teachers, subjects, observers);
    expect(csv).toBe(`﻿${OBSERVATION_COMMENT_HEADER.map((h) => `"${h}"`).join(',')}\r\n` +
      '"Ana Pérez","ana@x.mx","ÁLGEBRA","27-1 A","obs@x.mx","2026-10-17","90","Válida","Buen dominio","Tiempos","Planear ""mejor""","\'=1+1"\r\n');
  });

  it('keeps only the current capture when a re-evaluation supersedes another', () => {
    const newer = { ...base, id: 'b', supersedes_submission_id: 'a', metadata: { strengths: 'Nueva' } };
    const csv = observationFinalCommentsCsv([base, newer], teachers, subjects, observers);
    expect(csv).toContain('"Nueva"');
    expect(csv).not.toContain('Buen dominio');
  });

  it('shows the assigned observer, never the submitting account, and skips the excluded one', () => {
    const sentByProyectos = { ...base, submitted_by: 'proyectos-user-id' };
    const assigned = new Map([[1, ['proyectos-tup@tecplayacar.edu.mx', 'ana.obs@x.mx', 'otra.obs@x.mx']]]);
    const csv = observationFinalCommentsCsv([sentByProyectos], teachers, subjects, assigned);
    expect(csv).toContain('"ana.obs@x.mx; otra.obs@x.mx"');
    expect(csv).not.toContain('proyectos-tup');
    expect(observationFinalCommentsCsv([sentByProyectos], teachers, subjects, new Map([[1, ['proyectos-tup@tecplayacar.edu.mx']]]))).toContain('"27-1 A","","2026-10-17"');
    expect(observationFinalCommentsCsv([sentByProyectos], teachers, subjects, new Map())).toContain('"27-1 A","","2026-10-17"');
  });

  it('leaves missing comments blank and sorts by teacher name', () => {
    const second = { ...base, id: 'c', docente_id: 2, metadata: null, normalized_score: null, validity_status: 'invalid_excessive_na' };
    const lines = observationFinalCommentsCsv([second, base], teachers, subjects, observers).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^"Ana Pérez"/);
    expect(lines[2]).toBe('"Beto Ruiz","","ÁLGEBRA","27-1 A","obs@x.mx","2026-10-17","","invalid_excessive_na","","","",""');
  });
});
