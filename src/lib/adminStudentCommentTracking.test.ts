import { describe, expect, it } from 'vitest';
import { commentDTO, commentsCsv, exportState, literalCommentLike, parseCommentRequest, parseValidationRequest, PAGE_SIZE } from './adminStudentCommentTracking';

describe('student comment request and privacy boundary', () => {
  const cycles = [3, 4];
  it('accepts bounded POST body fields and verified cycle', () => {
    expect(parseCommentRequest({ cuatrimestreId: 3, page: 10000, keyword: ' Hola ', docente: ' María ', grupo: ' A ' }, cycles)).toEqual({ cycleId: 3, page: 10000, keyword: 'Hola', teacher: 'María', group: 'A', state: 'todos' });
    expect(parseCommentRequest({ cuatrimestreId: 3, estado: 'pendientes' }, cycles)?.state).toBe('pendientes');
    expect(parseCommentRequest({ cuatrimestreId: 3, estado: 'validados' }, cycles)?.state).toBe('validados');
    expect(parseCommentRequest({ cuatrimestreId: 3, estado: 'no_autorizados' }, cycles)?.state).toBe('no_autorizados');
    expect(PAGE_SIZE).toBe(20);
  });
  it('rejects invalid cycles, pages and oversized or malformed fields', () => {
    for (const body of [null, [], {}, { cuatrimestreId: 9 }, { cuatrimestreId: 3, page: 0 }, { cuatrimestreId: 3, page: 10001 }, { cuatrimestreId: 3, page: '2' }, { cuatrimestreId: 3, keyword: 'x' }, { cuatrimestreId: 3, docente: 'x'.repeat(101) }, { cuatrimestreId: 3, grupo: 7 }, { cuatrimestreId: 3, estado: 'otro' }]) {
      expect(parseCommentRequest(body, cycles)).toBeNull();
    }
  });
  it('escapes wildcard and backslash characters literally', () => {
    expect(literalCommentLike('a%_\\b')).toBe('%a\\%\\_\\\\b%');
  });
  it('keeps grouping IDs distinct without leaking student identity or scores', () => {
    const row = { docente_id: 7, grupo_id: 8, comentario_abierto: '  texto original  ', comentario_validado: null, estudiante_id: 'private', id: 99, created_at: 'private', calidad_general: 5 };
    expect(commentDTO(row, 'Docente', 'Grupo')).toEqual({ id: 99, docenteId: 7, grupoId: 8, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ', validado: false, estado: 'pendiente' });
    expect(commentDTO({ ...row, docente_id: 9, grupo_id: 10, id: 100, comentario_validado: true } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toEqual({ id: 100, docenteId: 9, grupoId: 10, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ', validado: true, estado: 'validado' });
    expect(commentDTO({ ...row, comentario_abierto: ' \n ' }, 'Docente', 'Grupo')).toBeNull();
    for (const invalid of [null, undefined, 0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
      expect(commentDTO({ ...row, docente_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
      expect(commentDTO({ ...row, grupo_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
      expect(commentDTO({ ...row, id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
    }
  });
  it('accepts one bounded page of validation decisions', () => {
    expect(parseValidationRequest({ cuatrimestreId: 3, validar: [1, 2, 2], quitar: [5] }, cycles)).toEqual({ cycleId: 3, validate: [1, 2], unvalidate: [5], reject: [], noContribution: [] });
    expect(parseValidationRequest({ cuatrimestreId: 4, validar: [], quitar: [7] }, cycles)).toEqual({ cycleId: 4, validate: [], unvalidate: [7], reject: [], noContribution: [] });
  });
  it('rejects malformed, overlapping, empty or oversized validation requests', () => {
    const many = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i + 1);
    for (const body of [null, [], { cuatrimestreId: 9, validar: [1], quitar: [] }, { cuatrimestreId: 3, validar: [], quitar: [] },
      { cuatrimestreId: 3, validar: [1], quitar: [1] }, { cuatrimestreId: 3, validar: ['1'], quitar: [] }, { cuatrimestreId: 3, validar: [0], quitar: [] },
      { cuatrimestreId: 3, validar: many, quitar: [] }, { cuatrimestreId: 3, validar: [1, 2], quitar: many.slice(2) }, { cuatrimestreId: 3, validar: [1] }]) {
      expect(parseValidationRequest(body, cycles)).toBeNull();
    }
  });
  it('accepts a third decision, "no autorizado", and keeps the three lists disjoint', () => {
    expect(parseValidationRequest({ cuatrimestreId: 3, validar: [1], quitar: [2], rechazar: [3, 3] }, cycles)).toEqual({ cycleId: 3, validate: [1], unvalidate: [2], reject: [3], noContribution: [] });
    expect(parseValidationRequest({ cuatrimestreId: 3, validar: [], quitar: [], rechazar: [4] }, cycles)).toEqual({ cycleId: 3, validate: [], unvalidate: [], reject: [4], noContribution: [] });
    for (const body of [{ cuatrimestreId: 3, validar: [1], quitar: [], rechazar: [1] }, { cuatrimestreId: 3, validar: [], quitar: [2], rechazar: [2] },
      { cuatrimestreId: 3, validar: [], quitar: [], rechazar: ['9'] }, { cuatrimestreId: 3, validar: [], quitar: [], rechazar: Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i + 1) }]) {
      expect(parseValidationRequest(body, cycles)).toBeNull();
    }
  });
  it('reports the review state of a comment', () => {
    const row = { id: 1, docente_id: 7, grupo_id: 8, comentario_abierto: 'texto', comentario_validado: false, comentario_no_autorizado: false };
    expect(commentDTO(row, 'D', 'G')?.estado).toBe('pendiente');
    expect(commentDTO({ ...row, comentario_no_autorizado: true }, 'D', 'G')).toMatchObject({ estado: 'no_autorizado', validado: false });
    expect(commentDTO({ ...row, comentario_validado: true }, 'D', 'G')).toMatchObject({ estado: 'validado', validado: true });
    expect(commentDTO({ ...row, comentario_validado: null, comentario_no_autorizado: undefined }, 'D', 'G')?.estado).toBe('pendiente');
  });
});

describe('comment CSV export', () => {
  it('accepts the five export states and defaults to all', () => {
    expect(exportState(null)).toBe('todos');
    for (const state of ['pendientes', 'validados', 'no_autorizados', 'sin_aporte', 'todos']) expect(exportState(state)).toBe(state);
    expect(exportState('otro')).toBeNull();
  });
  it('writes teacher, group, state and text only, escaping quotes and formulas', () => {
    const csv = commentsCsv([
      { docente: 'Ana', grupo: 'A', estado: 'validado', comentario: 'Dijo "bien"' },
      { docente: 'Luis', grupo: 'B', estado: 'no_autorizado', comentario: '=SUMA(1)' },
    ]);
    expect(csv).toBe('﻿"Docente","Grupo","Estado","Comentario"\r\n"Ana","A","Validado","Dijo ""bien"""\r\n"Luis","B","No autorizado","\'=SUMA(1)"\r\n');
  });
  it('accepts the fourth decision, "sin aporte", disjoint from the others', () => {
    const cycles = [3, 4];
    expect(parseValidationRequest({ cuatrimestreId: 3, validar: [1], quitar: [], rechazar: [2], sinAporte: [3, 3] }, cycles))
      .toEqual({ cycleId: 3, validate: [1], unvalidate: [], reject: [2], noContribution: [3] });
    for (const body of [{ cuatrimestreId: 3, validar: [], quitar: [], sinAporte: [1], rechazar: [1] }, { cuatrimestreId: 3, validar: [1], quitar: [], sinAporte: [1] },
      { cuatrimestreId: 3, validar: [], quitar: [], sinAporte: ['2'] }, { cuatrimestreId: 3, validar: [], quitar: [], sinAporte: Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i + 1) }]) {
      expect(parseValidationRequest(body, cycles)).toBeNull();
    }
  });
  it('reports "sin aporte" and exports it with its label', () => {
    const row = { id: 1, docente_id: 7, grupo_id: 8, comentario_abierto: 'ninguno', comentario_validado: false, comentario_no_autorizado: false, comentario_sin_aporte: true };
    expect(commentDTO(row, 'D', 'G')).toMatchObject({ estado: 'sin_aporte', validado: false });
    expect(commentsCsv([{ docente: 'D', grupo: 'G', estado: 'sin_aporte', comentario: 'ninguno' }])).toContain('"Sin aporte"');
  });
});
