import { describe, expect, it } from 'vitest';
import { studentEvaluationDraftForms } from './studentEvaluationDraftForms';

const codes = ['EJE-02', 'VIR-03', 'PP-04', 'SIM-05', 'CC-06', 'CD-07'];
const endpoints = [
  ['El docente me entregó o puso a disposición desde la primera sesión', 'El módulo ha contribuido a fortalecer mis competencias profesionales'],
  ['El docente publicó desde el inicio la planeación didáctica', 'El docente mantiene un trato respetuoso, ético y profesional'],
  ['El docente de prácticas explicó claramente los requisitos', 'El acompañamiento del docente contribuyó significativamente'],
  ['El docente explicó claramente los objetivos de la práctica', 'La práctica de simulación, tal como se impartió'],
  ['El docente supervisor clínico explicó claramente las actividades', 'El acompañamiento del docente supervisor clínico aporta valor real'],
  ['El docente me explicó claramente los objetivos, dinámica', 'Considero que el desempeño del docente ha sido positivo'],
];

describe('detached student evaluation drafts', () => {
  it('contains six distinct ordered instruments with twenty scored items and one optional comment', () => {
    expect(studentEvaluationDraftForms.map((form) => form.code)).toEqual(codes.map((code) => `SED-360-INST-EST-${code}-V1.1`));
    studentEvaluationDraftForms.forEach((form, index) => {
      expect(form.questions).toHaveLength(20);
      expect(form.questions.every((question) => question.trim().length > 0)).toBe(true);
      expect(new Set(form.questions).size).toBe(20);
      expect(form.questions[0]).toContain(endpoints[index][0]);
      expect(form.questions[19]).toContain(endpoints[index][1]);
      expect(form.scale).toEqual([1, 2, 3, 4, 5]);
      expect(form.comment.number).toBe(21);
      expect(form.comment.optional).toBe(true);
      expect(form.comment.guidance.length).toBeGreaterThan(10);
    });
    expect(new Set(studentEvaluationDraftForms.map((form) => form.title)).size).toBe(6);
  });
  it('does not advertise or import a runtime availability route', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./studentEvaluationDraftForms.ts', import.meta.url), 'utf8'));
    expect(source).not.toMatch(/\/api\/|\/estudiante\/evaluar|from ['"].*pages\//);
  });
});
