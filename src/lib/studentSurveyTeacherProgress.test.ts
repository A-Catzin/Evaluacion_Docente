import { describe, expect, it } from 'vitest';
import {
  buildTeacherProgress, fetchTeacherProgress, filterTeacherProgress, parseTeacherProgressFilters,
  summarizeTeacherProgress, TEACHER_PROGRESS_BLOCK_SIZE, type TeacherGroupProgress,
} from './studentSurveyTeacherProgress';

const row = (overrides: Partial<TeacherGroupProgress>): TeacherGroupProgress => ({
  docente_id: 1, docente: 'Ana López', docente_activo: true, grupo_id: 10, grupo: 'A', materia: 'Ética',
  elegibles: 10, respondidas: 5, ...overrides,
});

describe('buildTeacherProgress', () => {
  const teachers = buildTeacherProgress([
    row({}),
    row({ grupo_id: 11, grupo: 'B', elegibles: 10, respondidas: 10 }),
    row({ grupo_id: 12, grupo: 'A', materia: 'Lógica', elegibles: 20, respondidas: 0 }),
    row({ docente_id: 2, docente: 'Beto Ruiz', elegibles: 4, respondidas: 4 }),
  ]);

  it('sums groups of one subject into a single bar and the teacher total', () => {
    const ana = teachers.find((t) => t.id === 1)!;
    expect(ana.eligible).toBe(40);
    expect(ana.answered).toBe(15);
    expect(ana.progress).toBe(37.5);
    const etica = ana.subjects.find((s) => s.materia === 'Ética')!;
    expect([etica.eligible, etica.answered, etica.progress, etica.groups]).toEqual([20, 15, 75, ['A', 'B']]);
  });

  it('lists the least advanced teachers and subjects first', () => {
    expect(teachers.map((t) => t.id)).toEqual([1, 2]);
    expect(teachers[0].subjects.map((s) => s.materia)).toEqual(['Lógica', 'Ética']);
  });
});

describe('filters and summary', () => {
  const teachers = buildTeacherProgress([
    row({}),
    row({ docente_id: 2, docente: 'Beto Ruiz', materia: 'Álgebra', elegibles: 4, respondidas: 4 }),
    row({ docente_id: 3, docente: 'Carla Paz', elegibles: 6, respondidas: 0 }),
  ]);

  it('parses unknown states as todos', () => {
    expect(parseTeacherProgressFilters(new URLSearchParams('estado=x&q=%20ana%20'))).toEqual({ q: 'ana', state: 'todos' });
  });

  it('filters by state and by name or subject ignoring accents', () => {
    const ids = (state: 'todos' | 'pendientes' | 'sin_respuestas' | 'completos', q = '') =>
      filterTeacherProgress(teachers, { q, state }).map((t) => t.id).sort();
    expect(ids('pendientes')).toEqual([1, 3]);
    expect(ids('sin_respuestas')).toEqual([3]);
    expect(ids('completos')).toEqual([2]);
    expect(ids('todos', 'algebra')).toEqual([2]);
  });

  it('summarizes the shown teachers', () => {
    expect(summarizeTeacherProgress(teachers)).toMatchObject({ teachers: 3, complete: 1, withoutResponses: 1, eligible: 20, answered: 9, progress: 45 });
  });
});

describe('fetchTeacherProgress', () => {
  it('reads the RPC in ranged blocks until a short block', async () => {
    const ranges: Array<[number, number]> = [];
    const block = Array.from({ length: TEACHER_PROGRESS_BLOCK_SIZE }, (_, i) => row({ grupo_id: i }));
    const client = {
      rpc: () => ({
        range: async (from: number, to: number) => {
          ranges.push([from, to]);
          return { data: from === 0 ? block : [row({ grupo_id: 5000 })], error: null };
        },
      }),
    };
    const rows = await fetchTeacherProgress(client, 11);
    expect(rows).toHaveLength(TEACHER_PROGRESS_BLOCK_SIZE + 1);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});
