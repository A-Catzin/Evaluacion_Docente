import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCatalog } from '../lib/adminObservationTracking';
import { formatPersonName } from '../lib/personName';
import {
  buildAutodiagReport, buildPlanningReports, buildStudentInstrumentReports, buildVersionedReports, currentSubmissions,
  GENERAL_ITEM_COLUMNS, studentResponseValues, type AutodiagReport, type PlanningReport, type ReportCard,
  type StudentInstrumentReport, type VersionedReport, type VersionedSubmissionRow,
} from '../lib/teacherReport';

export type SummaryRow = { label: string; score: number | null; source: 'registrado' | 'calculado' | null };

export type TeacherReport = {
  teacher: { id: number; name: string; email: string | null };
  cycle: { id: number; clave: string };
  final: { score: number | null; category: string | null; completed: number | null; expected: number | null; modality: string | null; calculatedAt: string | null };
  summary: SummaryRow[];
  autodiag: AutodiagReport | null;
  observations: VersionedReport[];
  coordination: VersionedReport[];
  student: { instruments: StudentInstrumentReport[]; enrolled: number; comments: string[] };
  planning: PlanningReport[];
};

type Progress = { docente_id: number; inscripciones_elegibles: number | string; controles_enviados: number | string };

const IN_CHUNK = 100;

async function selectIn<T>(ids: readonly (string | number)[], query: (chunk: (string | number)[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += IN_CHUNK) {
    const { data, error } = await query(ids.slice(start, start + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

const must = <T>(res: { data: T | null; error: { message: string } | null }): T | null => {
  if (res.error) throw new Error(res.error.message);
  return res.data;
};

const toNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** Survey progress per teacher; the RPC checks the caller's own role, so it needs the user session. */
async function loadProgress(userClient: SupabaseClient, cycleId: number): Promise<Map<number, Progress>> {
  const { data, error } = await userClient.rpc('obtener_progreso_encuesta_estudiantil_nativa', { p_cuatrimestre_id: cycleId });
  if (error) throw new Error(error.message);
  return new Map(((data || []) as Progress[]).map((row) => [Number(row.docente_id), row]));
}

export async function loadReportCards(admin: SupabaseClient, userClient: SupabaseClient, cycleId: number): Promise<ReportCard[]> {
  const [groups, grades, progress] = await Promise.all([
    loadCatalog<{ docente_id: number }>((s, e) => admin.from('grupos').select('docente_id').eq('cuatrimestre_id', cycleId).eq('activo', true).order('id').range(s, e)),
    loadCatalog<Record<string, unknown>>((s, e) => admin.from('calificaciones_finales')
      .select('docente_id,calificacion_final,categoria_final,num_instrumentos_completados,num_instrumentos_esperados,score_autoevaluacion,score_observacion,score_encuesta_estudiantil,score_coordinacion,score_planeacion')
      .eq('cuatrimestre_id', cycleId).order('docente_id').range(s, e)),
    loadProgress(userClient, cycleId),
  ]);
  const gradeByTeacher = new Map(grades.map((g) => [Number(g.docente_id), g]));
  const ids = [...new Set([...groups.map((g) => g.docente_id), ...gradeByTeacher.keys()].filter(Boolean))];
  const teachers = await selectIn<{ id: number; nombre: string | null; apellidos: string | null; email: string | null }>(
    ids, (chunk) => admin.from('docentes').select('id,nombre,apellidos,email').in('id', chunk),
  );
  return teachers.map((t) => {
    const g = gradeByTeacher.get(t.id) || {};
    const p = progress.get(t.id);
    return {
      id: t.id,
      name: formatPersonName([t.nombre, t.apellidos].filter(Boolean).join(' ')) || t.email || `Docente #${t.id}`,
      email: t.email,
      finalScore: toNumber(g.calificacion_final),
      category: (g.categoria_final as string) || null,
      completed: toNumber(g.num_instrumentos_completados),
      expected: toNumber(g.num_instrumentos_esperados),
      scores: {
        autodiag: toNumber(g.score_autoevaluacion),
        observation: toNumber(g.score_observacion),
        student: toNumber(g.score_encuesta_estudiantil),
        coordination: toNumber(g.score_coordinacion),
        planning: toNumber(g.score_planeacion),
      },
      enrolled: Number(p?.inscripciones_elegibles || 0),
      responses: Number(p?.controles_enviados || 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function loadTeacherReport(
  admin: SupabaseClient,
  userClient: SupabaseClient,
  teacherId: number,
  cycleId: number,
): Promise<TeacherReport | null> {
  const [teacherRes, cycleRes] = await Promise.all([
    admin.from('docentes').select('id,nombre,apellidos,email').eq('id', teacherId).maybeSingle(),
    admin.from('cuatrimestres').select('id,clave').eq('id', cycleId).maybeSingle(),
  ]);
  const teacher = must(teacherRes) as { id: number; nombre: string | null; apellidos: string | null; email: string | null } | null;
  const cycle = must(cycleRes) as { id: number; clave: string } | null;
  if (!teacher || !cycle) return null;

  const [gradeRes, autoRes, questionsRes, subsRes, plansRes, surveyRes, progress] = await Promise.all([
    admin.from('calificaciones_finales').select('*').eq('docente_id', teacherId).eq('cuatrimestre_id', cycleId).maybeSingle(),
    admin.from('autodiagnosticos').select('*').eq('docente_id', teacherId).eq('cuatrimestre_id', cycleId).order('id', { ascending: false }).limit(1),
    admin.from('instrumento_preguntas').select('instrumento,seccion,orden,texto,opciones,tipo_respuesta,activa').in('instrumento', ['autodiagnostico', 'planeacion']).order('orden'),
    admin.from('instrument_submissions')
      .select('id,purpose,grupo,asignatura_id,submitted_at,submitted_by,raw_score,normalized_score,validity_status,definition_snapshot,metadata,supersedes_submission_id')
      .eq('docente_id', teacherId).eq('cuatrimestre_id', cycleId).order('submitted_at'),
    admin.from('planeaciones')
      .select('id,asignatura_id,grupo,estado,puntaje_promedio,no_aplica_count,fecha_evaluacion,observaciones_generales,comentario_retroalimentacion,evaluacion_detalle')
      .eq('docente_id', teacherId).eq('cuatrimestre_id', cycleId).order('id'),
    admin.from('encuesta_estudiantil_respuestas')
      .select(`id,instrumento,grupo_id,respuestas_instrumento,comentario_abierto,comentario_validado,${GENERAL_ITEM_COLUMNS.join(',')}`)
      .eq('docente_id', teacherId).eq('cuatrimestre_id', cycleId),
    loadProgress(userClient, cycleId),
  ]);
  const grade = (must(gradeRes) || {}) as Record<string, unknown>;
  const questions = (must(questionsRes) || []) as { instrumento: string; seccion: string | null; orden: number; texto: string; opciones: Record<string, unknown> | null; tipo_respuesta: string | null; activa: boolean | null }[];
  const submissions = currentSubmissions((must(subsRes) || []) as (VersionedSubmissionRow & { asignatura_id: number | null; supersedes_submission_id: string | null })[]);
  const plans = (must(plansRes) || []) as Record<string, any>[];
  const responses = (must(surveyRes) || []) as Record<string, any>[];

  const submissionIds = submissions.map((s) => s.id);
  const groupIds = [...new Set(responses.map((r) => r.grupo_id as number))];
  const groups = await selectIn<{ id: number; clave: string; grupo_normalizado: string | null; asignatura_id: number | null }>(
    groupIds, (chunk) => admin.from('grupos').select('id,clave,grupo_normalizado,asignatura_id').in('id', chunk),
  );
  const subjectIds = [...new Set([
    ...submissions.map((s) => s.asignatura_id), ...plans.map((p) => p.asignatura_id), ...groups.map((g) => g.asignatura_id),
  ].filter((id): id is number => typeof id === 'number'))];
  const evaluatorIds = [...new Set(submissions.map((s) => s.submitted_by).filter((id): id is string => Boolean(id)))];
  const [answers, evidence, subjects, evaluators] = await Promise.all([
    selectIn<{ submission_id: string; item_id: string; numeric_value: unknown; is_na: boolean }>(
      submissionIds, (chunk) => admin.from('instrument_answers').select('submission_id,item_id,numeric_value,is_na').in('submission_id', chunk)),
    selectIn<{ submission_id: string; section_id: string; evidence: string | null }>(
      submissionIds, (chunk) => admin.from('instrument_evidence').select('submission_id,section_id,evidence').in('submission_id', chunk)),
    selectIn<{ id: number; nombre: string }>(subjectIds, (chunk) => admin.from('asignaturas').select('id,nombre').in('id', chunk)),
    selectIn<{ id: string; email: string | null }>(evaluatorIds, (chunk) => admin.from('usuarios').select('id,email').in('id', chunk)),
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.nombre]));
  const versioned = buildVersionedReports(
    submissions.map((s) => ({ ...s, asignatura: s.asignatura_id ? subjectName.get(s.asignatura_id) ?? null : null })),
    answers,
    evidence,
    new Map(evaluators.map((u) => [u.id, u.email || ''])),
  );

  const groupLabel = new Map(groups.map((g) => [g.id, [g.asignatura_id ? subjectName.get(g.asignatura_id) : null, g.grupo_normalizado || g.clave].filter(Boolean).join(' · ')]));
  const instruments = buildStudentInstrumentReports(responses.map((r) => ({
    instrumento: String(r.instrumento),
    grupo: groupLabel.get(r.grupo_id) || 'Grupo',
    valores: studentResponseValues(r),
  })));
  // Only validated comments, alphabetically so their order cannot be matched to a group.
  const comments = responses
    .filter((r) => r.comentario_validado === true && typeof r.comentario_abierto === 'string' && r.comentario_abierto.trim())
    .map((r) => (r.comentario_abierto as string).trim())
    .sort((a, b) => a.localeCompare(b, 'es'));

  const planning = buildPlanningReports(
    plans.map((p) => ({ ...p, asignatura: subjectName.get(p.asignatura_id) ?? null }) as Parameters<typeof buildPlanningReports>[0][number]),
    questions.filter((q) => q.instrumento === 'planeacion' && q.tipo_respuesta === 'categoria' && q.activa !== false && q.seccion)
      .map((q) => ({ seccion: q.seccion!, orden: q.orden, texto: q.texto, opciones: q.opciones })),
  );
  const autoRows = (must(autoRes) || []) as Record<string, unknown>[];
  const autodiag = buildAutodiagReport(autoRows[0] || null, questions.filter((q) => q.instrumento === 'autodiagnostico'));

  const observations = versioned.filter((v) => v.purpose === 'observation');
  const coordination = versioned.filter((v) => v.purpose === 'coordination');
  const studentResponses = instruments.reduce((n, i) => n + i.responses, 0);
  const computedStudent = studentResponses ? instruments.reduce((n, i) => n + i.score * i.responses, 0) / studentResponses : null;
  const average = (rows: { score: number | null }[]) => {
    const scores = rows.map((r) => r.score).filter((s): s is number => s !== null);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };
  const row = (label: string, stored: unknown, computed: number | null): SummaryRow => {
    const value = toNumber(stored);
    if (value !== null) return { label, score: value, source: 'registrado' };
    return { label, score: computed, source: computed === null ? null : 'calculado' };
  };

  return {
    teacher: { id: teacher.id, name: formatPersonName([teacher.nombre, teacher.apellidos].filter(Boolean).join(' ')) || teacher.email || `Docente #${teacher.id}`, email: teacher.email },
    cycle,
    final: {
      score: toNumber(grade.calificacion_final),
      category: (grade.categoria_final as string) || null,
      completed: toNumber(grade.num_instrumentos_completados),
      expected: toNumber(grade.num_instrumentos_esperados),
      modality: (grade.modalidad_snapshot as string) || null,
      calculatedAt: (grade.calculada_en as string) || null,
    },
    summary: [
      row('Autoevaluación', grade.score_autoevaluacion, null),
      row('Observación de clase', grade.score_observacion, average(observations)),
      row('Encuesta estudiantil', grade.score_encuesta_estudiantil, computedStudent),
      row('Evaluación de coordinación', grade.score_coordinacion, average(coordination)),
      row('Planeación didáctica', grade.score_planeacion, null),
    ],
    autodiag,
    observations,
    coordination,
    student: { instruments, enrolled: Number(progress.get(teacherId)?.inscripciones_elegibles || 0), comments },
    planning,
  };
}
