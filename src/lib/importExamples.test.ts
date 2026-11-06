import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAssignmentSyncCsv } from './assignmentImportSync';
import { exampleCsv, IMPORT_EXAMPLES } from './importExamples';
import { findColumn, parseCsv } from './importCsv';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('import examples', () => {
  it('parse back to the declared headers and rows', () => {
    for (const example of Object.values(IMPORT_EXAMPLES)) {
      const records = parseCsv(exampleCsv(example).replace(/^﻿/, ''));
      expect(records[0]).toEqual(example.headers);
      expect(records.slice(1)).toEqual(example.rows);
      expect(example.rows.every((row) => row.length === example.headers.length)).toBe(true);
    }
  });

  it('assignments example is accepted by the real assignment parser without blockers', () => {
    const { rows, blockers } = parseAssignmentSyncCsv(exampleCsv(IMPORT_EXAMPLES.asignaciones));
    expect(blockers).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('every required header of the students and teachers examples is a literal the API looks up', () => {
    const students = source('../pages/api/admin/importar-alumnos.ts');
    for (const header of ['MATRICULA', 'CORREO INSTITUCIONAL', 'NOMBRE COMPLETO', 'PLAN DE ESTUDIOS', 'GRADO', 'GRUPO', 'ESTADO DE INSCRIPCION', 'CICLO']) {
      expect(students).toMatch(new RegExp(`["']${header}["']`));
      expect(findColumn(IMPORT_EXAMPLES.alumnos.headers, header)).toBeGreaterThanOrEqual(0);
    }
    const teachers = source('../pages/api/admin/importar-docentes.ts');
    for (const header of ['NOMBRE COMPLETO', 'CORREO', 'NUM EMPLEADO']) {
      expect(teachers).toContain(`"${header}"`);
      expect(findColumn(IMPORT_EXAMPLES.docentes.headers, header)).toBeGreaterThanOrEqual(0);
    }
  });

  it('teachers template endpoint serves the shared example', () => {
    expect(source('../pages/api/admin/importar-docentes.ts')).toContain('exampleCsv(IMPORT_EXAMPLES.docentes)');
  });

  it('lists the required columns before the optional ones', () => {
    for (const example of Object.values(IMPORT_EXAMPLES)) {
      const flags = example.columns.map((column) => column.required);
      expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
    }
  });
});
