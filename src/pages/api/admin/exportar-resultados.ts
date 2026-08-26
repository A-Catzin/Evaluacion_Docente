import type { APIRoute } from 'astro';
import { requireRole, AuthError } from '../../../lib/auth';
import { toCsv } from '../../../lib/csv';
import { formatScoreCsv } from '../../../services/scoring';

export const GET: APIRoute = async ({ cookies, url }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ['superadmin']));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response('Error interno', { status: 500 });
  }

  const cuatrimestreId = Number.parseInt(url.searchParams.get('cuatrimestre_id') || '', 10);
  if (!Number.isSafeInteger(cuatrimestreId) || cuatrimestreId <= 0) {
    return new Response(JSON.stringify({ error: 'cuatrimestre_id válido requerido' }), { status: 400 });
  }

  try {
    const { data: cycle, error: cycleError } = await client
      .from('cuatrimestres')
      .select('id,clave')
      .eq('id', cuatrimestreId)
      .maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle) return new Response(JSON.stringify({ error: 'Ciclo no encontrado' }), { status: 404 });

    const { data: scores, error: scoreError } = await client
      .from('calificaciones_finales')
      .select('docente_id,score_encuesta_estudiantil,score_coordinacion,score_planeacion,score_observacion,score_autoevaluacion,calificacion_final,categoria_final,num_instrumentos_completados,num_instrumentos_esperados')
      .eq('cuatrimestre_id', cuatrimestreId)
      .gt('num_instrumentos_completados', 0);
    if (scoreError) throw scoreError;

    const teacherIds = [...new Set((scores || []).map((score) => Number(score.docente_id)).filter(Number.isSafeInteger))];
    const { data: teachers, error: teacherError } = teacherIds.length
      ? await client.from('docentes').select('id,nombre,apellidos,email,campus,modalidad').in('id', teacherIds).eq('activo', true).order('apellidos')
      : { data: [], error: null };
    if (teacherError) throw teacherError;

    const teachersById = new Map((teachers || []).map((teacher) => [teacher.id, teacher]));
    const rows = (scores || [])
      .filter((score) => teachersById.has(Number(score.docente_id)))
      .sort((a, b) => {
        const left = teachersById.get(Number(a.docente_id))!;
        const right = teachersById.get(Number(b.docente_id))!;
        return `${left.apellidos} ${left.nombre}`.localeCompare(`${right.apellidos} ${right.nombre}`);
      })
      .map((score) => {
        const teacher = teachersById.get(Number(score.docente_id))!;
        return [
          teacher.nombre,
          teacher.apellidos,
          teacher.email,
          teacher.campus || '',
          teacher.modalidad || '',
          formatScoreCsv(score.score_encuesta_estudiantil),
          formatScoreCsv(score.score_coordinacion),
          formatScoreCsv(score.score_planeacion),
          formatScoreCsv(score.score_observacion),
          formatScoreCsv(score.score_autoevaluacion),
          formatScoreCsv(score.calificacion_final),
          score.categoria_final,
          `${score.num_instrumentos_completados}/${score.num_instrumentos_esperados}`,
        ];
      });
    const csv = toCsv([[
      'Nombre', 'Apellidos', 'Correo', 'Campus', 'Modalidad', 'Encuesta estudiantil',
      'Coordinación', 'Planeación', 'Observación', 'Autodiagnóstico', 'Calificación final',
      'Categoría', 'Instrumentos',
    ], ...rows]);
    const safeKey = String(cycle.clave).replace(/[^A-Za-z0-9_-]/g, '_');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="resultados_${safeKey}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[admin results export] failed', error);
    return new Response('Error interno', { status: 500 });
  }
};
