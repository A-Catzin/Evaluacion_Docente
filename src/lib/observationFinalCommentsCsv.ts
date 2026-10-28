import { toCsv } from './csv';
import { currentSubmissions } from './teacherReport';

export type ObservationCommentSubmission = {
  id: string;
  docente_id: number;
  asignatura_id: number | null;
  grupo: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  normalized_score: unknown;
  validity_status: string | null;
  supersedes_submission_id: string | null;
  metadata: Record<string, unknown> | null;
};

export const OBSERVATION_COMMENT_HEADER = [
  'Docente', 'Correo', 'Asignatura', 'Grupo', 'Observador', 'Fecha', 'Calificación', 'Validez',
  'Fortalezas', 'Área prioritaria de mejora', 'Recomendación', 'Observaciones generales',
];

/** Accounts used only to submit evaluations on someone's behalf; they are never the observer shown in the export. */
export const EXCLUDED_OBSERVER_EMAILS = ['proyectos-tup@tecplayacar.edu.mx'];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * One row per current observation (a re-evaluation replaces the capture it supersedes) with the four
 * closing comments written by the observer. Teachers without an observation are not listed.
 * "Observador" is the observer assigned to the teacher, not whoever submitted the capture.
 */
export function observationFinalCommentsCsv(
  submissions: ObservationCommentSubmission[],
  teachers: Map<number, { name: string; email: string | null }>,
  subjects: Map<number, string>,
  assignedObservers: Map<number, string[]>,
): string {
  const rows = currentSubmissions(submissions)
    .map((s) => ({ s, teacher: teachers.get(s.docente_id) }))
    .sort((a, b) => (a.teacher?.name ?? '').localeCompare(b.teacher?.name ?? '', 'es') || String(a.s.submitted_at).localeCompare(String(b.s.submitted_at)));
  return toCsv([
    OBSERVATION_COMMENT_HEADER,
    ...rows.map(({ s, teacher }) => [
      teacher?.name ?? `Docente #${s.docente_id}`,
      teacher?.email ?? '',
      s.asignatura_id != null ? subjects.get(s.asignatura_id) ?? '' : '',
      s.grupo ?? '',
      (assignedObservers.get(s.docente_id) ?? [])
        .filter((email) => !EXCLUDED_OBSERVER_EMAILS.includes(email.toLowerCase()))
        .join('; '),
      s.submitted_at ? s.submitted_at.slice(0, 10) : '',
      s.normalized_score == null ? '' : Number(s.normalized_score),
      s.validity_status === 'valid' ? 'Válida' : s.validity_status ?? '',
      text(s.metadata?.strengths),
      text(s.metadata?.priority_area),
      text(s.metadata?.recommendation),
      text(s.metadata?.general_observations),
    ]),
  ]);
}
