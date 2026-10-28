import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../../lib/auth';
import { dbAdmin } from '../../../../lib/db';
import { loadCatalog } from '../../../../lib/adminObservationTracking';
import { formatPersonName } from '../../../../lib/personName';
import { observationFinalCommentsCsv, type ObservationCommentSubmission } from '../../../../lib/observationFinalCommentsCsv';

// Bulk export of the four closing comments of every observation in a cycle. Superadmin only.
export const GET: APIRoute = async ({ cookies, url }) => {
  try {
    await requireRole(cookies, ['superadmin']);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response('Error interno', { status: 500 });
  }
  const cycleId = Number.parseInt(url.searchParams.get('cuatrimestre') || '', 10);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return new Response('Ciclo inválido', { status: 400 });

  try {
    const client = dbAdmin();
    const submissions = await loadCatalog<ObservationCommentSubmission>((start, end) => client.from('instrument_submissions')
      .select('id,docente_id,asignatura_id,grupo,submitted_by,submitted_at,normalized_score,validity_status,supersedes_submission_id,metadata')
      .eq('purpose', 'observation').eq('cuatrimestre_id', cycleId).order('submitted_at').order('id').range(start, end), 50000);

    const teacherIds = [...new Set(submissions.map((s) => s.docente_id))];
    const subjectIds = [...new Set(submissions.map((s) => s.asignatura_id).filter((id): id is number => id != null))];
    const teachers = new Map<number, { name: string; email: string | null }>();
    const subjects = new Map<number, string>();
    const assignedObservers = new Map<number, string[]>();
    for (let i = 0; i < teacherIds.length; i += 100) {
      const { data, error } = await client.from('docentes').select('id,nombre,apellidos,email').in('id', teacherIds.slice(i, i + 100));
      if (error) throw new Error('teachers');
      for (const t of data || []) teachers.set(t.id, { name: formatPersonName([t.nombre, t.apellidos].filter(Boolean).join(' ')) || t.email || `Docente #${t.id}`, email: t.email });
    }
    for (let i = 0; i < subjectIds.length; i += 100) {
      const { data, error } = await client.from('asignaturas').select('id,nombre').in('id', subjectIds.slice(i, i + 100));
      if (error) throw new Error('subjects');
      for (const s of data || []) subjects.set(s.id, s.nombre);
    }
    // The observer is whoever is assigned to the teacher in the cycle, not whoever submitted the capture.
    const assignments = await loadCatalog<{ docente_id: number; evaluator_id: string }>((start, end) => client.from('observation_teacher_assignments')
      .select('docente_id,evaluator_id').eq('cuatrimestre_id', cycleId).is('revoked_at', null).order('docente_id').order('evaluator_id').range(start, end), 50000);
    const evaluatorEmails = new Map<string, string>();
    const evaluatorIds = [...new Set(assignments.map((a) => a.evaluator_id))];
    for (let i = 0; i < evaluatorIds.length; i += 100) {
      const { data, error } = await client.from('usuarios').select('id,email').in('id', evaluatorIds.slice(i, i + 100));
      if (error) throw new Error('observers');
      for (const u of data || []) evaluatorEmails.set(u.id, u.email || '');
    }
    for (const a of assignments) {
      const email = evaluatorEmails.get(a.evaluator_id);
      if (email) assignedObservers.set(a.docente_id, [...(assignedObservers.get(a.docente_id) ?? []), email]);
    }
    return new Response(observationFinalCommentsCsv(submissions, teachers, subjects, assignedObservers), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="comentarios-observaciones-ciclo-${cycleId}.csv"`,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return new Response('No se pudo generar el archivo', { status: 503 });
  }
};
