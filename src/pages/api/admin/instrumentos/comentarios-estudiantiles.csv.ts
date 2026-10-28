import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../../lib/auth';
import { dbAdmin } from '../../../../lib/db';
import { loadCatalog } from '../../../../lib/adminObservationTracking';
import { commentDTO, commentsCsv, exportState } from '../../../../lib/adminStudentCommentTracking';
import { formatPersonName } from '../../../../lib/personName';

type Row = { id: number; docente_id: number; grupo_id: number; comentario_abierto: string | null; comentario_validado: boolean | null; comentario_no_autorizado: boolean | null; comentario_sin_aporte: boolean | null };

// Exports every student comment of a cycle in one review state (or all of them), without pagination.
// Superadmin only: the original text can identify who wrote it.
export const GET: APIRoute = async ({ cookies, url }) => {
  try {
    await requireRole(cookies, ['superadmin']);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response('Error interno', { status: 500 });
  }
  const cycleId = Number.parseInt(url.searchParams.get('cuatrimestre') || '', 10);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return new Response('Ciclo inválido', { status: 400 });
  const state = exportState(url.searchParams.get('estado'));
  if (!state) return new Response('Estado inválido', { status: 400 });

  try {
    const client = dbAdmin();
    const rows = await loadCatalog<Row>((start, end) => {
      let query = client.from('encuesta_estudiantil_respuestas')
        .select('id,docente_id,grupo_id,comentario_abierto,comentario_validado,comentario_no_autorizado,comentario_sin_aporte')
        .eq('cuatrimestre_id', cycleId).not('comentario_abierto', 'is', null);
      if (state === 'validados') query = query.eq('comentario_validado', true);
      else if (state === 'no_autorizados') query = query.eq('comentario_no_autorizado', true);
      else if (state === 'sin_aporte') query = query.eq('comentario_sin_aporte', true);
      else if (state === 'pendientes') query = query.eq('comentario_validado', false).eq('comentario_no_autorizado', false).eq('comentario_sin_aporte', false);
      return query.order('docente_id').order('grupo_id').order('id').range(start, end);
    }, 50000);
    const teacherIds = [...new Set(rows.map(row => row.docente_id))];
    const groupIds = [...new Set(rows.map(row => row.grupo_id))];
    const teachers = new Map<number, string>();
    const groups = new Map<number, string>();
    for (let i = 0; i < teacherIds.length; i += 100) {
      const { data, error } = await client.from('docentes').select('id,nombre,apellidos').in('id', teacherIds.slice(i, i + 100));
      if (error) throw new Error('teachers');
      for (const t of data || []) teachers.set(t.id, formatPersonName([t.nombre, t.apellidos].filter(Boolean).join(' ')) || 'Docente no disponible');
    }
    for (let i = 0; i < groupIds.length; i += 100) {
      const { data, error } = await client.from('grupos').select('id,clave').in('id', groupIds.slice(i, i + 100));
      if (error) throw new Error('groups');
      for (const g of data || []) groups.set(g.id, g.clave || 'Grupo no disponible');
    }
    const comments = rows
      .map(row => commentDTO(row, teachers.get(row.docente_id) || 'Docente no disponible', groups.get(row.grupo_id) || 'Grupo no disponible'))
      .filter((comment): comment is NonNullable<typeof comment> => comment !== null);
    const label = state === 'todos' ? 'todos' : state;
    return new Response(commentsCsv(comments), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="comentarios-estudiantiles-${label}-ciclo-${cycleId}.csv"`,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return new Response('No se pudo generar el archivo', { status: 503 });
  }
};
