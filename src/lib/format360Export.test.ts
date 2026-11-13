import { describe, expect, it } from 'vitest';
import { deriveShift, format360Headers, format360Row, nextCycleLabel, type ScoreRow } from './format360Export';

const row = (over: Partial<ScoreRow> = {}): ScoreRow => ({
  score_encuesta_estudiantil: 90, score_coordinacion: 85, score_planeacion: 100, score_observacion: 80,
  score_autoevaluacion: 80, calificacion_final: 87.5, categoria_final: 'Eficaz', ...over,
});

describe('format 360 export', () => {
  it('computes the next cycle label', () => {
    expect(nextCycleLabel('27-1')).toBe('27-2');
    expect(nextCycleLabel('26-3')).toBe('27-1');
    expect(nextCycleLabel('raro')).toBe('');
  });

  it('keeps the requested column order with cycle labels in the headers', () => {
    const headers = format360Headers('27-1', '26-3');
    expect(headers).toHaveLength(22);
    expect(headers[4]).toBe('Final 360°- ciclo 27-1');
    expect(headers[12]).toBe('PLAN ACCIÓN ACADEMIA 27-2');
    expect(headers[14]).toBe('Final 360°- ciclo 26-3');
    expect(headers[15]).toBe('Promedio OBS CLASE (2.5)');
    expect(headers[16]).toBe('Promedio Estudiantil (3.5)');
    expect(headers[20]).toBe('Puntos Totales AuDx');
    expect(headers.join('|')).not.toContain('NÓMINA');
  });

  it('omits the previous-cycle block, so no header repeats, when there is no previous cycle', () => {
    const headers = format360Headers('27-1', null);
    expect(headers).toHaveLength(13);
    expect(new Set(headers).size).toBe(headers.length);
    const cells = format360Row({ name: 'D', offers: '', shift: '', coordinatorEmail: '', coordinatorName: '' }, false);
    expect(cells).toHaveLength(13);
  });

  it('fills a row with the same width as the headers and leaves manual columns empty', () => {
    const cells = format360Row({
      name: 'Docente Uno', offers: 'PEDAGOGIA', shift: 'Matutino',
      coordinatorEmail: 'c@x.mx', coordinatorName: 'C X', current: row(), previous: row({ calificacion_final: 70 }), previousAutoPoints: 100,
    });
    expect(cells).toHaveLength(22);
    expect(cells.slice(3, 10)).toEqual(['Eficaz', 87.5, 90, 80, 85, 100, 80]);
    expect([cells[12], cells[21]]).toEqual(['', '']);
    expect(cells[14]).toBe(70);
    expect(cells[20]).toBe(100);
  });

  it('leaves the student score empty when it was left out, and marks NP and unfinished self-assessment', () => {
    const cells = format360Row({
      name: 'D', offers: '', shift: '', coordinatorEmail: '', coordinatorName: '',
      current: row({ score_encuesta_estudiantil: null, score_planeacion: null, score_autoevaluacion: 0, instrument_validity: { autodiagnostico: 'not_done' } }),
    });
    expect(cells[5]).toBe('');
    expect(cells[8]).toBe('NP');
    expect(cells[9]).toBe('No realizado');
  });

  it('shows "No iniciado" for a teacher without a result and blank scores', () => {
    const cells = format360Row({ name: 'D', offers: '', shift: '', coordinatorEmail: '', coordinatorName: '' });
    expect(cells[3]).toBe('No iniciado');
    expect(cells.slice(4, 10)).toEqual(['', '', '', '', '', '']);
  });

  it('derives the shift from class hours when none is stored', () => {
    expect(deriveShift('Matutino', ['15:00:00'])).toBe('Matutino');
    expect(deriveShift(null, ['07:00:00', '09:00:00'])).toBe('Matutino');
    expect(deriveShift(null, ['15:00:00'])).toBe('Vespertino');
    expect(deriveShift(null, ['08:00:00', '17:00:00'])).toBe('Matutino / Vespertino');
    expect(deriveShift(null, [])).toBe('');
  });
});
