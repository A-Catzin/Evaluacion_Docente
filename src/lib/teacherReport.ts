import { studentSurveyForm } from './studentSurveyQuestions';

/** General 19-item columns, in the order the general form stores and shows them. */
export const GENERAL_ITEM_COLUMNS = [
  'calidad_general', 'item_plan_estudio', 'item_trato_respeto', 'item_asistencia', 'item_puntualidad',
  'item_participacion', 'item_dominio_materia', 'item_plataforma_moodle', 'item_pensamiento_critico',
  'item_desafio_intelectual', 'item_claridad_objetivos', 'item_lecturas_aprendizaje', 'item_respeto_reglas',
  'item_interes_materia', 'item_apoyos_didacticos', 'item_actitudes_valores', 'item_retroalimentacion',
  'item_criterios_evaluacion', 'item_receptividad',
] as const;

export type ReportNote = { label: string; text: string };

export type AutodiagReport = {
  date: string | null;
  total: number | null;
  level: string | null;
  comment: string | null;
  items: { n: number; text: string; value: number | null }[];
};

export type VersionedReport = {
  id: string;
  purpose: string;
  title: string;
  version: string | null;
  subject: string | null;
  group: string | null;
  date: string | null;
  evaluator: string | null;
  raw: number | null;
  score: number | null;
  validity: string | null;
  sections: { title: string; evidence: string | null; items: { code: string; label: string; value: number | null; valueLabel: string }[] }[];
  notes: ReportNote[];
};

export type StudentInstrumentReport = {
  instrument: string;
  title: string;
  code: string;
  responses: number;
  mean: number;
  score: number;
  groups: { label: string; count: number }[];
  items: { text: string; counts: number[]; average: number }[];
};

export type PlanningReport = {
  id: number;
  subject: string | null;
  group: string | null;
  status: string | null;
  score: number | null;
  naCount: number;
  date: string | null;
  criteria: { n: number; text: string; level: string; observations: string[] }[];
  notes: ReportNote[];
};

export type ReportCard = {
  id: number;
  name: string;
  email: string | null;
  finalScore: number | null;
  category: string | null;
  completed: number | null;
  expected: number | null;
  scores: { autodiag: number | null; observation: number | null; student: number | null; coordination: number | null; planning: number | null };
  enrolled: number;
  responses: number;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function buildAutodiagReport(
  row: Record<string, unknown> | null,
  questions: { orden: number; texto: string }[],
): AutodiagReport | null {
  if (!row) return null;
  return {
    date: text(row.fecha_respuesta),
    total: num(row.puntaje_total),
    level: text(row.nivel_desempeno),
    comment: text(row.comentarios),
    items: [...questions].sort((a, b) => a.orden - b.orden).map((q) => ({ n: q.orden, text: q.texto, value: num(row[`r${q.orden}`]) })),
  };
}

/** Drops submissions that a later revision replaced. */
export function currentSubmissions<T extends { id: string; supersedes_submission_id?: string | null }>(rows: T[]): T[] {
  const replaced = new Set(rows.map((r) => r.supersedes_submission_id).filter(Boolean));
  return rows.filter((r) => !replaced.has(r.id));
}

const NOTE_LABELS: Record<string, string> = {
  strengths: 'Fortalezas',
  priority_area: 'Área prioritaria de mejora',
  recommendation: 'Recomendación',
  general_observations: 'Observaciones generales',
};

type SnapshotItem = { id: string; code?: string; label?: string; position?: number };
type SnapshotSection = { id: string; title?: string; code?: string; position?: number; items?: SnapshotItem[] };
type Snapshot = { title?: string; version?: string; scale?: { labels?: Record<string, string> }; sections?: SnapshotSection[] };

export type VersionedSubmissionRow = {
  id: string;
  purpose: string;
  grupo: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  raw_score: unknown;
  normalized_score: unknown;
  validity_status: string | null;
  asignatura?: string | null;
  definition_snapshot: Snapshot | null;
  metadata: Record<string, unknown> | null;
};

export function buildVersionedReports(
  submissions: VersionedSubmissionRow[],
  answers: { submission_id: string; item_id: string; numeric_value: unknown; is_na: boolean }[],
  evidence: { submission_id: string; section_id: string; evidence: string | null }[],
  evaluators: Map<string, string>,
): VersionedReport[] {
  const byPosition = (a: { position?: number }, b: { position?: number }) => (a.position ?? 0) - (b.position ?? 0);
  return submissions.map((s) => {
    const snapshot = s.definition_snapshot || {};
    const labels = snapshot.scale?.labels || {};
    const answerMap = new Map(answers.filter((a) => a.submission_id === s.id).map((a) => [a.item_id, a]));
    const evidenceMap = new Map(evidence.filter((e) => e.submission_id === s.id).map((e) => [e.section_id, text(e.evidence)]));
    const sections = [...(snapshot.sections || [])].sort(byPosition).map((section) => ({
      title: section.title || section.code || 'Sección',
      evidence: evidenceMap.get(section.id) ?? null,
      items: [...(section.items || [])].sort(byPosition).map((item) => {
        const answer = answerMap.get(item.id);
        const value = answer && !answer.is_na ? num(answer.numeric_value) : null;
        const label = value === null ? '' : labels[String(value)];
        return {
          code: item.code || '',
          label: item.label || '',
          value,
          valueLabel: !answer ? 'Sin respuesta' : value === null ? 'N/A' : label ? `${value} · ${label}` : String(value),
        };
      }),
    }));
    const notes = Object.entries(s.metadata || {})
      .map(([key, value]) => ({ key, text: text(value) }))
      .filter((n): n is { key: string; text: string } => n.text !== null)
      .sort((a, b) => (a.key in NOTE_LABELS ? Object.keys(NOTE_LABELS).indexOf(a.key) : 99) - (b.key in NOTE_LABELS ? Object.keys(NOTE_LABELS).indexOf(b.key) : 99))
      .map((n) => ({ label: NOTE_LABELS[n.key] || n.key, text: n.text }));
    return {
      id: s.id,
      purpose: s.purpose,
      title: snapshot.title || 'Instrumento',
      version: snapshot.version || null,
      subject: s.asignatura ?? null,
      group: s.grupo,
      date: s.submitted_at,
      evaluator: (s.submitted_by && evaluators.get(s.submitted_by)) || null,
      raw: num(s.raw_score),
      score: num(s.normalized_score),
      validity: s.validity_status,
      sections,
      notes,
    };
  });
}

/** Answer values of one student response, in the order of its form's questions. */
export function studentResponseValues(row: Record<string, unknown>): (number | null)[] {
  if (row.instrumento === 'general-19') return GENERAL_ITEM_COLUMNS.map((col) => num(row[col]));
  return Array.isArray(row.respuestas_instrumento) ? row.respuestas_instrumento.map(num) : [];
}

/**
 * Aggregates responses per instrument. Only counts and averages leave this function,
 * so a single student's answers cannot be read back from the report.
 */
export function buildStudentInstrumentReports(
  rows: { instrumento: string; grupo: string; valores: (number | null)[] }[],
): StudentInstrumentReport[] {
  const order: string[] = [];
  const byInstrument = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byInstrument.has(row.instrumento)) {
      byInstrument.set(row.instrumento, []);
      order.push(row.instrumento);
    }
    byInstrument.get(row.instrumento)!.push(row);
  }
  const reports: StudentInstrumentReport[] = [];
  for (const instrument of order) {
    const form = studentSurveyForm(instrument);
    if (!form) continue;
    const responses = byInstrument.get(instrument)!.filter((r) => r.valores.length === form.questions.length);
    if (!responses.length) continue;
    const items = form.questions.map((question, index) => {
      const counts = [0, 0, 0, 0, 0];
      let sum = 0;
      let answered = 0;
      for (const r of responses) {
        const v = r.valores[index];
        if (v === null || v < 1 || v > 5) continue;
        counts[v - 1] += 1;
        sum += v;
        answered += 1;
      }
      return { text: question, counts, average: answered ? sum / answered : 0 };
    });
    const all = responses.flatMap((r) => r.valores).filter((v): v is number => v !== null && v >= 1 && v <= 5);
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const groupCounts = new Map<string, number>();
    for (const r of responses) groupCounts.set(r.grupo, (groupCounts.get(r.grupo) || 0) + 1);
    reports.push({
      instrument,
      title: form.title,
      code: form.code,
      responses: responses.length,
      mean,
      score: (mean - 1) * 25,
      groups: [...groupCounts.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([label, count]) => ({ label, count })),
      items,
    });
  }
  return reports;
}

const PLANNING_LEVELS: Record<string, string> = { '2': '2 · Satisfactorio', '1': '1 · Suficiente', '0': '0 · Insuficiente', na: 'N/A' };

export function buildPlanningReports(
  plans: {
    id: number; asignatura: string | null; grupo: string | null; estado: string | null; puntaje_promedio: unknown;
    no_aplica_count: unknown; fecha_evaluacion: string | null; observaciones_generales: string | null;
    comentario_retroalimentacion: string | null; evaluacion_detalle: Record<string, { score?: unknown; obs?: unknown; otros?: unknown }> | null;
  }[],
  categories: { seccion: string; orden: number; texto: string; opciones: Record<string, unknown> | null }[],
): PlanningReport[] {
  const sorted = [...categories].sort((a, b) => a.orden - b.orden);
  return plans.map((plan) => {
    const detail = plan.evaluacion_detalle || {};
    const criteria = sorted.map((cat) => {
      const entry = detail[cat.seccion] || {};
      const level = String(entry.score ?? '');
      const options = (cat.opciones?.[`obs${level}`] as unknown[] | undefined) || [];
      const picked = Array.isArray(entry.obs) ? entry.obs : [];
      const observations = picked
        .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < options.length)
        .map((i) => String(options[i]));
      const other = text(entry.otros);
      if (other) observations.push(`Otros: ${other}`);
      return { n: cat.orden, text: cat.texto, level: PLANNING_LEVELS[level] || 'Sin evaluar', observations };
    });
    const notes: ReportNote[] = [];
    const general = text(plan.observaciones_generales);
    const feedback = text(plan.comentario_retroalimentacion);
    if (general) notes.push({ label: 'Observaciones generales', text: general });
    if (feedback) notes.push({ label: 'Retroalimentación al docente', text: feedback });
    return {
      id: plan.id,
      subject: plan.asignatura,
      group: plan.grupo,
      status: plan.estado,
      score: num(plan.puntaje_promedio),
      naCount: num(plan.no_aplica_count) ?? 0,
      date: plan.fecha_evaluacion,
      criteria,
      notes,
    };
  });
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

export function filterReportCards(cards: ReportCard[], query: string): ReportCard[] {
  const term = fold(query.trim());
  if (!term) return cards;
  return cards.filter((c) => fold(`${c.name} ${c.email || ''}`).includes(term));
}
