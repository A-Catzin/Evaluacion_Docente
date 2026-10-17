import { describe, expect, it } from 'vitest';
import { commentDTO, literalCommentLike, parseCommentRequest, parseValidationRequest, PAGE_SIZE } from './adminStudentCommentTracking';

describe('student comment request and privacy boundary', () => {
  const cycles = [3, 4];
  it('accepts bounded POST body fields and verified cycle', () => {
    expect(parseCommentRequest({ cuatrimestreId: 3, page: 10000, keyword: ' Hola ', docente: ' María ', grupo: ' A ' }, cycles)).toEqual({ cycleId: 3, page: 10000, keyword: 'Hola', teacher: 'María', group: 'A', state: 'todos' });
    expect(parseCommentRequest({ cuatrimestreId: 3, estado: 'pendientes' }, cycles)?.state).toBe('pendientes');
    expect(parseCommentRequest({ cuatrimestreId: 3, estado: 'validados' }, cycles)?.state).toBe('validados');
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
    expect(commentDTO(row, 'Docente', 'Grupo')).toEqual({ id: 99, docenteId: 7, grupoId: 8, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ', validado: false });
    expect(commentDTO({ ...row, docente_id: 9, grupo_id: 10, id: 100, comentario_validado: true } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toEqual({ id: 100, docenteId: 9, grupoId: 10, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ', validado: true });
    expect(commentDTO({ ...row, comentario_abierto: ' \n ' }, 'Docente', 'Grupo')).toBeNull();
    for (const invalid of [null, undefined, 0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
      expect(commentDTO({ ...row, docente_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
      expect(commentDTO({ ...row, grupo_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
      expect(commentDTO({ ...row, id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
    }
  });
  it('accepts one bounded page of validation decisions', () => {
    expect(parseValidationRequest({ cuatrimestreId: 3, validar: [1, 2, 2], quitar: [5] }, cycles)).toEqual({ cycleId: 3, validate: [1, 2], unvalidate: [5] });
    expect(parseValidationRequest({ cuatrimestreId: 4, validar: [], quitar: [7] }, cycles)).toEqual({ cycleId: 4, validate: [], unvalidate: [7] });
  });
  it('rejects malformed, overlapping, empty or oversized validation requests', () => {
    const many = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i + 1);
    for (const body of [null, [], { cuatrimestreId: 9, validar: [1], quitar: [] }, { cuatrimestreId: 3, validar: [], quitar: [] },
      { cuatrimestreId: 3, validar: [1], quitar: [1] }, { cuatrimestreId: 3, validar: ['1'], quitar: [] }, { cuatrimestreId: 3, validar: [0], quitar: [] },
      { cuatrimestreId: 3, validar: many, quitar: [] }, { cuatrimestreId: 3, validar: [1, 2], quitar: many.slice(2) }, { cuatrimestreId: 3, validar: [1] }]) {
      expect(parseValidationRequest(body, cycles)).toBeNull();
    }
  });
});
