import { describe, expect, it } from 'vitest';
import { buildStudentSurveySummaries, GENERAL_STUDENT_PROMPTS } from './studentSurveyQuestions';

describe('buildStudentSurveySummaries', () => {
  it('pairs averages with each instrument questions and keeps instruments separate', () => {
    const summaries = buildStudentSurveySummaries([
      { instrumento: 'general-19', respuestas: '3', score_normalizado: '75.00', promedios: Array(19).fill('4.00') },
      { instrumento: 'cd07-v1', respuestas: 2, score_normalizado: 87.5, promedios: Array(20).fill(4.5) },
    ]);
    expect(summaries.map((s) => [s.instrument, s.responses, s.score, s.items.length])).toEqual([
      ['general-19', 3, 75, 19],
      ['cd07-v1', 2, 87.5, 20],
    ]);
    expect(summaries[0].items[0]).toEqual({ text: GENERAL_STUDENT_PROMPTS[0].text, average: 4 });
    expect(summaries[1].title).toBe('Evaluación de talleres culturales, artísticos y deportivos');
    expect(summaries[1].code).toBe('SED-360-INST-EST-CD-07-V1.1');
  });

  it('drops unknown instruments and rows whose averages do not match the form', () => {
    expect(buildStudentSurveySummaries([
      { instrumento: 'otro', respuestas: 1, score_normalizado: 50, promedios: Array(20).fill(3) },
      { instrumento: 'pp04-v1', respuestas: 1, score_normalizado: 50, promedios: Array(19).fill(3) },
      { instrumento: 'general-19', respuestas: 0, score_normalizado: 50, promedios: Array(19).fill(3) },
      { instrumento: 'sim05-v1', respuestas: 1, score_normalizado: 50, promedios: null },
    ])).toEqual([]);
  });
});
