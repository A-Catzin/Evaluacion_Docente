import { describe, expect, it } from 'vitest';
import {
  buildAutodiagReport, buildPlanningReports, buildStudentInstrumentReports, buildVersionedReports,
  currentSubmissions, filterReportCards, GENERAL_ITEM_COLUMNS, studentResponseValues, type ReportCard,
} from './teacherReport';
import { GENERAL_STUDENT_PROMPTS } from './studentSurveyQuestions';

describe('teacher report builders', () => {
  it('pairs self-assessment answers with their questions in order', () => {
    const row: Record<string, unknown> = { fecha_respuesta: '2026-09-04', puntaje_total: 118, nivel_desempeno: 'Excelente', comentarios: 'ok' };
    for (let i = 1; i <= 24; i += 1) row[`r${i}`] = i === 3 ? 3 : 5;
    const report = buildAutodiagReport(row, [{ orden: 2, texto: 'Dos' }, { orden: 1, texto: 'Uno' }, { orden: 3, texto: 'Tres' }]);
    expect(report?.items).toEqual([
      { n: 1, text: 'Uno', value: 5 },
      { n: 2, text: 'Dos', value: 5 },
      { n: 3, text: 'Tres', value: 3 },
    ]);
    expect(report).toMatchObject({ total: 118, level: 'Excelente', comment: 'ok' });
    expect(buildAutodiagReport(null, [])).toBeNull();
  });

  it('keeps only the latest revision of each versioned submission', () => {
    const subs = [
      { id: 'a', supersedes_submission_id: null },
      { id: 'b', supersedes_submission_id: 'a' },
      { id: 'c', supersedes_submission_id: null },
    ];
    expect(currentSubmissions(subs).map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('groups versioned answers by snapshot section with scale labels, evidence and notes', () => {
    const [report] = buildVersionedReports(
      [{
        id: 's1', purpose: 'observation', grupo: 'G1', submitted_at: '2026-10-14T00:00:00Z', submitted_by: 'u1',
        raw_score: 2, normalized_score: 66.67, validity_status: 'valid', asignatura: 'Finanzas',
        definition_snapshot: {
          title: 'Observación escolarizada', version: 'v1.2',
          scale: { labels: { '1': 'Requiere mejora', '2': 'Adecuado', '3': 'Destacado' } },
          sections: [
            { id: 'sec2', title: 'Social', position: 2, items: [{ id: 'i3', code: 'SOC1', label: 'Respeto', position: 1 }] },
            { id: 'sec1', title: 'Cognitiva', position: 1, items: [
              { id: 'i2', code: 'COG2', label: 'Dominio', position: 2 },
              { id: 'i1', code: 'COG1', label: 'Claridad', position: 1 },
            ] },
          ],
        },
        metadata: { strengths: 'Dominio del tema', recommendation: '', extra_note: 'Nota libre' },
      }],
      [
        { submission_id: 's1', item_id: 'i1', numeric_value: 3, is_na: false },
        { submission_id: 's1', item_id: 'i2', numeric_value: null, is_na: true },
        { submission_id: 's1', item_id: 'i3', numeric_value: 2, is_na: false },
      ],
      [{ submission_id: 's1', section_id: 'sec1', evidence: 'Explicó con ejemplos' }],
      new Map([['u1', 'observador@tup.mx']]),
    );
    expect(report.sections.map((s) => s.title)).toEqual(['Cognitiva', 'Social']);
    expect(report.sections[0]).toEqual({
      title: 'Cognitiva', evidence: 'Explicó con ejemplos', items: [
        { code: 'COG1', label: 'Claridad', value: 3, valueLabel: '3 · Destacado' },
        { code: 'COG2', label: 'Dominio', value: null, valueLabel: 'N/A' },
      ],
    });
    expect(report).toMatchObject({ title: 'Observación escolarizada', evaluator: 'observador@tup.mx', score: 66.67, subject: 'Finanzas' });
    expect(report.notes).toEqual([
      { label: 'Fortalezas', text: 'Dominio del tema' },
      { label: 'extra_note', text: 'Nota libre' },
    ]);
  });

  it('reads general and specialized student answers in stored order', () => {
    const general: Record<string, unknown> = { instrumento: 'general-19' };
    GENERAL_ITEM_COLUMNS.forEach((col, i) => { general[col] = (i % 5) + 1; });
    expect(studentResponseValues(general)).toEqual(GENERAL_ITEM_COLUMNS.map((_, i) => (i % 5) + 1));
    expect(studentResponseValues({ instrumento: 'cd07-v1', respuestas_instrumento: [5, 4] })).toEqual([5, 4]);
  });

  it('aggregates student responses per instrument without exposing individual answers', () => {
    const five = Array(19).fill(5);
    const reports = buildStudentInstrumentReports([
      { instrumento: 'general-19', grupo: 'Ética · A', valores: five },
      { instrumento: 'general-19', grupo: 'Ética · A', valores: [3, ...Array(18).fill(5)] },
      { instrumento: 'general-19', grupo: 'Lógica · B', valores: five },
      { instrumento: 'cd07-v1', grupo: 'Taller · C', valores: Array(20).fill(4) },
      { instrumento: 'desconocido', grupo: 'X', valores: [1] },
    ]);
    expect(reports.map((r) => [r.instrument, r.responses])).toEqual([['general-19', 3], ['cd07-v1', 1]]);
    const [general, cd] = reports;
    expect(general.items[0]).toEqual({ text: GENERAL_STUDENT_PROMPTS[0].text, counts: [0, 0, 1, 0, 2], average: 13 / 3 });
    expect(general.groups).toEqual([{ label: 'Ética · A', count: 2 }, { label: 'Lógica · B', count: 1 }]);
    expect(general.mean).toBeCloseTo((19 * 3 * 5 - 2) / 57);
    expect(general.score).toBeCloseTo((general.mean - 1) * 25);
    expect(cd).toMatchObject({ title: 'Evaluación de talleres culturales, artísticos y deportivos', score: 75 });
  });

  it('maps planning criteria levels to the observations selected for that level', () => {
    const [plan] = buildPlanningReports(
      [{
        id: 1, asignatura: 'Finanzas', grupo: 'G1', estado: 'Corrección', puntaje_promedio: 54, no_aplica_count: 0,
        fecha_evaluacion: '2026-09-05', observaciones_generales: 'General', comentario_retroalimentacion: 'Retro',
        evaluacion_detalle: {
          cat_01: { score: '2', obs: [0], otros: '' },
          cat_02: { score: '1', obs: [1, 9], otros: 'Repetitivo' },
          cat_03: { score: 'na', obs: [], otros: '' },
        },
      }],
      [
        { seccion: 'cat_02', orden: 2, texto: 'Inicio', opciones: { obs1: ['a', 'b'] } },
        { seccion: 'cat_01', orden: 1, texto: 'Fundamentos', opciones: { obs2: ['bien'] } },
        { seccion: 'cat_03', orden: 3, texto: 'Desarrollo', opciones: {} },
      ],
    );
    expect(plan.criteria).toEqual([
      { n: 1, text: 'Fundamentos', level: '2 · Satisfactorio', observations: ['bien'] },
      { n: 2, text: 'Inicio', level: '1 · Suficiente', observations: ['b', 'Otros: Repetitivo'] },
      { n: 3, text: 'Desarrollo', level: 'N/A', observations: [] },
    ]);
    expect(plan).toMatchObject({ subject: 'Finanzas', status: 'Corrección', score: 54, notes: [
      { label: 'Observaciones generales', text: 'General' },
      { label: 'Retroalimentación al docente', text: 'Retro' },
    ] });
  });

  it('filters report cards by accent-insensitive name or email', () => {
    const cards = [
      { id: 1, name: 'Armando Chavarría Morales', email: 'tup-d81@tecplayacar.edu.mx' },
      { id: 2, name: 'Ana López', email: 'tup-d2@tecplayacar.edu.mx' },
    ] as ReportCard[];
    expect(filterReportCards(cards, 'chavarria').map((c) => c.id)).toEqual([1]);
    expect(filterReportCards(cards, 'D2@').map((c) => c.id)).toEqual([2]);
    expect(filterReportCards(cards, '  ').map((c) => c.id)).toEqual([1, 2]);
  });
});
