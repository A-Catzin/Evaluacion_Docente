import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './importCsv';
import { buildTeacherProgress, filterTeacherProgress, type TeacherGroupProgress } from './studentSurveyTeacherProgress';
import { teacherProgressCsv } from './studentSurveyTeacherProgressCsv';

const group = (overrides: Partial<TeacherGroupProgress>): TeacherGroupProgress => ({
  docente_id: 1, docente: 'Ana López', docente_activo: true,
  grupo_id: 10, grupo: 'A', materia: 'Ética', elegibles: 10, respondidas: 5, ...overrides,
});
const teachers = buildTeacherProgress([
  group({}), group({ grupo_id: 11, grupo: 'B', respondidas: 10 }),
  group({ grupo_id: 12, materia: 'Lógica', elegibles: 20, respondidas: 0 }),
  group({ docente_id: 2, docente: 'Beto Ruiz', elegibles: 4, respondidas: 4, docente_activo: false }),
]);

describe('teacher progress CSV', () => {
  it('exports the selected cycle, teacher totals and subject detail in page order', () => {
    const csv = teacherProgressCsv(teachers, '27-1');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const [header, ...rows] = parseCsv(csv.slice(1));
    expect(header).toEqual([
      'Ciclo', 'Docente', 'Estado del docente', 'Respondidas docente', 'Elegibles docente', 'Avance docente (%)',
      'Materia', 'Grupos', 'Respondidas materia', 'Elegibles materia', 'Avance materia (%)',
    ]);
    expect(rows).toEqual([
      ['27-1', 'ANA LÓPEZ', 'Activo', '15', '40', '37.5', 'Lógica', 'A', '0', '20', '0'],
      ['27-1', 'ANA LÓPEZ', 'Activo', '15', '40', '37.5', 'Ética', 'A · B', '15', '20', '75'],
      ['27-1', 'BETO RUIZ', 'Inactivo', '4', '4', '100', 'Ética', 'A', '4', '4', '100'],
    ]);
  });

  it('exports only the teachers left by the existing search and state filters', () => {
    const shown = filterTeacherProgress(teachers, { q: 'ana', state: 'pendientes' });
    const csv = teacherProgressCsv(shown, '27-1');
    expect(csv).toContain('ANA LÓPEZ');
    expect(csv).not.toContain('BETO RUIZ');
    expect(parseCsv(csv.slice(1))).toHaveLength(3);
    const empty = filterTeacherProgress(teachers, { q: 'ana', state: 'completos' });
    expect(parseCsv(teacherProgressCsv(empty, '27-1').slice(1))).toHaveLength(1);
  });

  it('quotes special text and neutralizes formulas without exporting survey responses', () => {
    const special = buildTeacherProgress([group({ docente: '=1+1', materia: 'Diseño, "III"\nTaller' })]);
    const [, row] = parseCsv(teacherProgressCsv(special, '27-1').slice(1));
    expect(row[1]).toBe("'=1+1");
    expect(row[6]).toBe('Diseño, "III"\nTaller');
    expect(row).toHaveLength(11);
  });
});

describe('teacher progress download wiring', () => {
  const page = readFileSync(new URL('../pages/admin/instrumentos/avance-docentes.astro', import.meta.url), 'utf8');

  it('reuses the authenticated filtered page data and sends a private CSV attachment', () => {
    expect(page).toContain("requireRole(Astro.cookies, ['superadmin'])");
    expect(page).toContain("Astro.url.searchParams.get('formato') === 'csv'");
    expect(page).toContain('teacherProgressCsv(teachers, cycleLabel)');
    expect(page).toContain("'Content-Type': 'text/csv; charset=utf-8'");
    expect(page).toContain("'Cache-Control': 'private, no-store'");
    expect(page).toContain('attachment; filename="avance-docentes-ciclo-${cuatrimestreId}.csv"');
    expect(page).toContain('if (loadError || !cuatrimestreId)');
  });

  it('offers a download link preserving the selected cycle, query and state', () => {
    expect(page).toContain('cuatrimestre: String(cuatrimestreId)');
    expect(page).toContain('q: filters.q');
    expect(page).toContain('estado: filters.state');
    expect(page).toContain("formato: 'csv'");
    expect(page).toContain('href={csvDownloadUrl}');
    expect(page).toContain('Descargar CSV');
  });
});
