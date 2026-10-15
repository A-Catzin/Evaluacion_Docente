import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newObservationFormats, getNewObservationFormat } from './newObservationFormats';

const approved = [
  { slug: 'campos-clinicos', code: 'observation_supervision_clinical', title: 'Campos clínicos' },
  { slug: 'practica-profesional', code: 'observation_professional_practice', title: 'Práctica Profesional' },
  { slug: 'simulacion-clinica', code: 'observation_simulation', title: 'Simulación clínica' },
  { slug: 'cultura-y-deporte', code: 'observation_teaching_competencies', title: 'Cultura y Deporte' },
];

const menu = () => readFileSync(new URL('../pages/coordinador/captura/observacion.astro', import.meta.url), 'utf8');
const adminMenu = () => readFileSync(new URL('../pages/admin/evaluar-docentes/observacion.astro', import.meta.url), 'utf8');
const route = () => readFileSync(new URL('../pages/coordinador/captura/observacion/[tipo].astro', import.meta.url), 'utf8');

describe('new observation entry formats', () => {
  it('maps exactly four unique semantic slugs to approved internal codes and visible titles', () => {
    expect(newObservationFormats).toEqual(approved);
    expect(new Set(newObservationFormats.map(format => format.slug)).size).toBe(4);
    expect(new Set(newObservationFormats.map(format => format.code)).size).toBe(4);
    for (const format of newObservationFormats) {
      expect(getNewObservationFormat(format.slug)).toEqual(format);
      expect(format.title).not.toMatch(/^(?:CC|PP|SIM|AUTO)(?:-|\d)/i);
    }
  });

  it('rejects unsupported and inherited modality slugs instead of resolving a code', () => {
    for (const slug of [undefined, '', 'escolarizado', 'ejecutivo', 'virtual', 'CC-06', '__proto__', 'simulacion-clinica/extra']) {
      expect(getNewObservationFormat(slug)).toBeNull();
    }
  });

  it('links all four cards from the window-gated menu using the existing query string', () => {
    const source = menu();
    expect(source).toContain('/coordinador/captura/observacion/${format.slug}${qs}');
    expect(source).toContain('newObservationFormats.map');
    expect(source).toContain("window.state !== 'open'");
    for (const old of ['escolarizado', 'ejecutivo', 'virtual']) expect(source).toContain(`/coordinador/captura/observacion-${old}${'${qs}'}`);
    expect(source).not.toMatch(/CC-06|PP-05|SIM-05|AUTO-CD-07/);
  });

  it('links all four new formats from the Admin picker while preserving teacher and term context', () => {
    const source = adminMenu();
    expect(source).toContain('newObservationFormats.map');
    expect(source).toContain('/coordinador/captura/observacion/${format.slug}${qs}');
    expect(source).toContain("Astro.url.searchParams.get('docente_id')");
    expect(source).toContain("params.set('docente_id', docenteIdParam)");
    expect(source).toContain("Astro.url.searchParams.get('cuatrimestre')");
    expect(source).toContain("params.set('cuatrimestre', cuatrimestreParam)");
    for (const old of ['escolarizado', 'ejecutivo', 'virtual']) {
      expect(source).toContain(`/coordinador/captura/observacion-${old}${'${qs}'}`);
    }
    expect(source).not.toMatch(/<h2[^>]*>\s*(?:CC-06|PP-05|SIM-05|AUTO-CD-07)\b/i);
  });

  it('fails closed on invalid paths and shows only active versions inside the open window', () => {
    const source = route();
    expect(source).toContain('getNewObservationFormat(Astro.params.tipo)');
    expect(source).toContain('Astro.response.status = 404');
    expect(source).toContain('const capture = format ?');
    expect(source).toContain("getInstrumentSubmissionWindow(client, cycleId, 'observation')");
    expect(source).toContain("getMyAssignedTeacherIds(client, 'observation', cycleId)");
    expect(source).toContain('getActiveInstrumentDefinition(client, format.code)');
    expect(source).toContain('No hay una versión vigente del instrumento.');
    expect(source).not.toContain('sourceRecordId=');
    expect(source).not.toMatch(/CC-06|PP-05|SIM-05|AUTO-CD-07/);
  });
});
