import { describe, expect, it } from 'vitest';
import { groupComments } from './adminStudentCommentView';

describe('groupComments', () => {
  it('keeps homonymous teachers and identically named groups separate by numeric keys', () => {
    const rows = [
      { docenteId: 1, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: 'primero' },
      { docenteId: 2, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: 'segundo' },
      { docenteId: 1, grupoId: 4, docente: 'Ana', grupo: 'A', comentario: 'tercero' },
      { docenteId: 1, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: '<img onerror=alert(1)>' },
    ];
    expect(groupComments(rows)).toEqual([
      { docenteId: 1, docente: 'Ana', groups: [
        { grupoId: 3, grupo: 'A', comments: ['primero', '<img onerror=alert(1)>'] },
        { grupoId: 4, grupo: 'A', comments: ['tercero'] },
      ] },
      { docenteId: 2, docente: 'Ana', groups: [{ grupoId: 3, grupo: 'A', comments: ['segundo'] }] },
    ]);
  });
});
