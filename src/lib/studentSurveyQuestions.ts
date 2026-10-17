import { SPECIALIZED_INSTRUMENT_CODES, type StudentEvaluationInstrument } from './studentEvaluations';
import { studentEvaluationDraftForms } from './studentEvaluationDraftForms';

export type StudentPrompt = { text: string; range: number; labels?: string[] };

// General 19-item form, in the same order the answers are stored.
export const GENERAL_STUDENT_PROMPTS: readonly StudentPrompt[] = [
  { text: 'En términos generales, ¿cómo califica la calidad de la docencia recibida?', range: 5, labels: ['1 Muy deficiente', '2', '3', '4', '5 Excelente'] },
  { text: 'El docente presentó y siguió el plan de estudios de la asignatura.', range: 5 },
  { text: 'El docente mantuvo un trato respetuoso con el grupo.', range: 5 },
  { text: 'El docente cumplió con la asistencia programada.', range: 5 },
  { text: 'El docente inició y concluyó las sesiones con puntualidad.', range: 5 },
  { text: 'El docente promovió la participación de las y los estudiantes.', range: 5 },
  { text: 'El docente demostró dominio de los contenidos de la asignatura.', range: 5 },
  { text: 'El docente utilizó adecuadamente la plataforma institucional cuando fue necesaria.', range: 5 },
  { text: 'El docente fomentó el pensamiento crítico.', range: 5 },
  { text: 'El docente planteó retos intelectuales acordes con la asignatura.', range: 5 },
  { text: 'El docente explicó con claridad los objetivos y actividades del curso.', range: 5 },
  { text: 'Las lecturas y actividades favorecieron mi aprendizaje.', range: 5 },
  { text: 'El docente promovió el respeto a las reglas acordadas.', range: 5 },
  { text: 'El docente despertó interés por la asignatura.', range: 5 },
  { text: 'El docente utilizó apoyos didácticos pertinentes.', range: 5 },
  { text: 'El docente mostró actitudes y valores congruentes con su función.', range: 5 },
  { text: 'El docente proporcionó retroalimentación útil y oportuna.', range: 5 },
  { text: 'El docente explicó con claridad los criterios de evaluación.', range: 5 },
  { text: 'El docente fue receptivo a dudas y comentarios del grupo.', range: 5 },
];

export type StudentSurveySummary = {
  instrument: StudentEvaluationInstrument;
  title: string;
  code: string;
  responses: number;
  score: number;
  items: { text: string; average: number }[];
};

export type StudentSurveyForm = { title: string; code: string; questions: readonly string[] };

/** Title, code and ordered questions of a student instrument, or null when unknown. */
export function studentSurveyForm(instrument: string): StudentSurveyForm | null {
  if (instrument === 'general-19') {
    return { title: 'Encuesta estudiantil general', code: 'native-19-v2', questions: GENERAL_STUDENT_PROMPTS.map((p) => p.text) };
  }
  const code = SPECIALIZED_INSTRUMENT_CODES[instrument as keyof typeof SPECIALIZED_INSTRUMENT_CODES];
  const form = code ? studentEvaluationDraftForms.find((f) => f.code === code) : undefined;
  return form ? { title: form.title, code: form.code, questions: form.questions } : null;
}

/** Pairs the per-item averages returned by the database with each instrument's questions. */
export function buildStudentSurveySummaries(
  rows: { instrumento: string; respuestas: number | string; score_normalizado: number | string; promedios: (number | string)[] | null }[],
): StudentSurveySummary[] {
  const summaries: StudentSurveySummary[] = [];
  for (const row of rows) {
    const instrument = row.instrumento as StudentEvaluationInstrument;
    const form = studentSurveyForm(instrument);
    if (!form) continue;
    const { title, code, questions } = form;
    const averages = (row.promedios || []).map(Number);
    const responses = Number(row.respuestas);
    const score = Number(row.score_normalizado);
    if (averages.length !== questions.length || !Number.isFinite(score) || !(responses > 0)) continue;
    summaries.push({
      instrument,
      title,
      code,
      responses,
      score,
      items: questions.map((text, index) => ({ text, average: averages[index] })),
    });
  }
  return summaries;
}
