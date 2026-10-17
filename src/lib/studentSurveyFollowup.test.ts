import { describe, expect, it } from 'vitest';
import {
  fetchFollowupRows, filterFollowupRows, followupCsv, followupPlans, FOLLOWUP_BLOCK_SIZE, FOLLOWUP_MAX_ROWS,
  parseFollowupFilters, summarizeFollowup, type FollowupRow,
} from './studentSurveyFollowup';

const row = (overrides: Partial<FollowupRow>): FollowupRow => ({
  estudiante_id: 1, nombre: 'Ana López', matricula: 'TUP1', email: 'tup1@tecplayacar.edu.mx', tiene_cuenta: false,
  ultimo_acceso: null, planes: 'PEDAGOGÍA', asignadas: 2, completadas: 0,
  pendientes: [{ materia: 'Ética', docente: 'Juan Pérez', grupo: 'A' }], ...overrides,
});

const rows = [
  row({ estudiante_id: 1 }),
  row({ estudiante_id: 2, nombre: 'Beto Ruiz', matricula: 'TUP2', tiene_cuenta: true, completadas: 1, planes: 'ARQUITECTURA · DEPORTES' }),
  row({ estudiante_id: 3, nombre: 'Carla Díaz', matricula: 'TUP3', tiene_cuenta: true, completadas: 2, pendientes: [] }),
];

describe('student survey follow-up', () => {
  it('parses filters with safe defaults', () => {
    expect(parseFollowupFilters(new URLSearchParams(''))).toEqual({ q: '', plan: '', state: 'pendientes', page: 1 });
    expect(parseFollowupFilters(new URLSearchParams('estado=otro&pagina=-3&q=%20ana%20'))).toEqual({ q: 'ana', plan: '', state: 'pendientes', page: 1 });
    expect(parseFollowupFilters(new URLSearchParams('estado=sin-sesion&pagina=4&plan=PEDAGOGÍA')).state).toBe('sin-sesion');
  });

  it('filters by state, plan and accent-insensitive search', () => {
    const f = (query: string) => filterFollowupRows(rows, parseFollowupFilters(new URLSearchParams(query))).map((r) => r.estudiante_id);
    expect(f('')).toEqual([1, 2]);
    expect(f('estado=sin-sesion')).toEqual([1]);
    expect(f('estado=en-proceso')).toEqual([2]);
    expect(f('estado=completos')).toEqual([3]);
    expect(f('estado=todos&plan=DEPORTES')).toEqual([2]);
    expect(f('estado=todos&q=diaz')).toEqual([3]);
    expect(f('estado=todos&q=tup2')).toEqual([2]);
  });

  it('summarizes progress and lists plans', () => {
    expect(summarizeFollowup(rows)).toEqual({
      students: 3, pendingStudents: 2, neverLoggedIn: 1, completeStudents: 1, assigned: 6, completed: 3, progress: 50,
    });
    expect(followupPlans(rows)).toEqual(['ARQUITECTURA', 'DEPORTES', 'PEDAGOGÍA']);
  });

  it('exports escaped CSV and neutralizes spreadsheet formulas', () => {
    const csv = followupCsv([row({ nombre: '=HYPERLINK("x")', pendientes: [{ materia: 'A, B', docente: 'D', grupo: 'G' }] })]);
    const [header, line] = csv.replace('﻿', '').split('\r\n');
    expect(header).toBe('Nombre,Matrícula,Correo,Plan,Ha iniciado sesión,Asignadas,Completadas,Pendientes,Materias pendientes');
    expect(line).toBe(`"'=HYPERLINK(""x"")",TUP1,tup1@tecplayacar.edu.mx,PEDAGOGÍA,No,2,0,2,"A, B (D)"`);
  });

  it('reads past the 1000-row API cap in ranged blocks', async () => {
    const fakeClient = (total: number) => {
      const ranges: [number, number][] = [];
      return {
        ranges,
        rpc: () => ({
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            const count = Math.max(0, Math.min(to + 1, total) - from);
            return { data: Array.from({ length: count }, (_, i) => row({ estudiante_id: from + i + 1, asignadas: '2' as unknown as number })), error: null };
          },
        }),
      };
    };
    const current = fakeClient(2768);
    const result = await fetchFollowupRows(current, 11);
    expect(result.rows).toHaveLength(2768);
    expect(result.truncated).toBe(false);
    expect(new Set(result.rows.map((r) => r.estudiante_id)).size).toBe(2768);
    expect(result.rows[0].asignadas).toBe(2);
    expect(current.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);

    const exact = fakeClient(FOLLOWUP_BLOCK_SIZE);
    expect((await fetchFollowupRows(exact, 11)).rows).toHaveLength(FOLLOWUP_BLOCK_SIZE);
    expect(exact.ranges).toHaveLength(2);

    const huge = await fetchFollowupRows(fakeClient(FOLLOWUP_MAX_ROWS + 10), 11);
    expect(huge.rows).toHaveLength(FOLLOWUP_MAX_ROWS);
    expect(huge.truncated).toBe(true);
  });
});
