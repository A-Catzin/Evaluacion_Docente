import { describe, expect, it } from 'vitest';
import { commentDTO, literalCommentLike, parseCommentRequest, PAGE_SIZE } from './adminStudentCommentTracking';

describe('student comment request and privacy boundary', () => {
  const cycles = [3, 4];
  it('accepts bounded POST body fields and verified cycle', () => {
    expect(parseCommentRequest({ cuatrimestreId: 3, page: 10000, keyword: ' Hola ', docente: ' María ', grupo: ' A ' }, cycles)).toEqual({ cycleId: 3, page: 10000, keyword: 'Hola', teacher: 'María', group: 'A' });
    expect(PAGE_SIZE).toBe(20);
  });
  it('rejects invalid cycles, pages and oversized or malformed fields', () => {
    for (const body of [null, [], {}, { cuatrimestreId: 9 }, { cuatrimestreId: 3, page: 0 }, { cuatrimestreId: 3, page: 10001 }, { cuatrimestreId: 3, page: '2' }, { cuatrimestreId: 3, keyword: 'x' }, { cuatrimestreId: 3, docente: 'x'.repeat(101) }, { cuatrimestreId: 3, grupo: 7 }]) {
      expect(parseCommentRequest(body, cycles)).toBeNull();
    }
  });
  it('escapes wildcard and backslash characters literally', () => {
    expect(literalCommentLike('a%_\\b')).toBe('%a\\%\\_\\\\b%');
  });
  it('keeps grouping IDs distinct without leaking response identity or scores', () => {
    const row = { docente_id: 7, grupo_id: 8, comentario_abierto: '  texto original  ', estudiante_id: 'private', id: 99, created_at: 'private', calidad_general: 5 };
    expect(commentDTO(row, 'Docente', 'Grupo')).toEqual({ docenteId: 7, grupoId: 8, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ' });
    expect(commentDTO({ ...row, docente_id: 9, grupo_id: 10, id: 100 } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toEqual({ docenteId: 9, grupoId: 10, docente: 'Docente', grupo: 'Grupo', comentario: '  texto original  ' });
    expect(commentDTO({ ...row, comentario_abierto: ' \n ' }, 'Docente', 'Grupo')).toBeNull();
    for (const invalid of [null, undefined, 0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
      expect(commentDTO({ ...row, docente_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
      expect(commentDTO({ ...row, grupo_id: invalid } as unknown as Parameters<typeof commentDTO>[0], 'Docente', 'Grupo')).toBeNull();
    }
  });
});
