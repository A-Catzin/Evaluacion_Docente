import { describe, expect, it } from 'vitest';
import { groupComments } from './adminStudentCommentView';

describe('groupComments', () => {
  it('keeps homonymous teachers and identically named groups separate by numeric keys', () => {
    const rows = [
      { id: 10, docenteId: 1, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: 'primero', validado: true },
      { id: 11, docenteId: 2, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: 'segundo', validado: false },
      { id: 12, docenteId: 1, grupoId: 4, docente: 'Ana', grupo: 'A', comentario: 'tercero', validado: false },
      { id: 13, docenteId: 1, grupoId: 3, docente: 'Ana', grupo: 'A', comentario: '<img onerror=alert(1)>', validado: false },
    ];
    expect(groupComments(rows)).toEqual([
      { docenteId: 1, docente: 'Ana', groups: [
        { grupoId: 3, grupo: 'A', comments: [{ id: 10, comentario: 'primero', validado: true }, { id: 13, comentario: '<img onerror=alert(1)>', validado: false }] },
        { grupoId: 4, grupo: 'A', comments: [{ id: 12, comentario: 'tercero', validado: false }] },
      ] },
      { docenteId: 2, docente: 'Ana', groups: [{ grupoId: 3, grupo: 'A', comments: [{ id: 11, comentario: 'segundo', validado: false }] }] },
    ]);
  });
});
