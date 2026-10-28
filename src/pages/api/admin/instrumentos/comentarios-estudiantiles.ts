import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../../lib/auth';
import { dbAdmin } from '../../../../lib/db';
import { loadCatalog } from '../../../../lib/adminObservationTracking';
import { commentDTO, literalCommentLike, MAX_FILTER_IDS, PAGE_SIZE, parseCommentRequest, parseValidationRequest } from '../../../../lib/adminStudentCommentTracking';
import { formatPersonName } from '../../../../lib/personName';

const MAX_BODY_BYTES = 1024;
type Teacher = { id: number; nombre: string | null; apellidos: string | null };
type Group = { id: number; clave: string | null };
type Comment = { id: number; docente_id: number; grupo_id: number; comentario_abierto: string | null; comentario_validado: boolean | null; comentario_no_autorizado: boolean | null; comentario_sin_aporte: boolean | null };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  } });
}

async function boundedBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('body');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new Error('body');
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('body');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('body'); }
}

const teacherName = (teacher: Teacher) => formatPersonName([teacher.nombre, teacher.apellidos].filter(Boolean).join(' ')) || 'Docente no disponible';
const groupName = (group: Group) => group.clave || 'Grupo no disponible';
const matches = (label: string, term: string) => label.toLocaleLowerCase('es').includes(term.toLocaleLowerCase('es'));

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    await requireRole(cookies, ['superadmin']);
  } catch (error) {
    if (error instanceof AuthError) {
      const body = await error.response.json().catch(() => ({ error: 'No autorizado' }));
      return json(body, error.response.status);
    }
    return json({ error: 'Error interno' }, 500);
  }

  let body: unknown;
  try { body = await boundedBody(request); }
  catch { return json({ error: 'Solicitud inválida' }, 400); }

  try {
    const client = dbAdmin();
    const cycles = await loadCatalog<{ id: number }>((start, end) => client.from('cuatrimestres').select('id').order('id').range(start, end));
    const filters = parseCommentRequest(body, cycles.map(c => c.id));
    if (!filters) return json({ error: 'Solicitud inválida' }, 400);

    let teacherIds: number[] | null = null;
    let groupIds: number[] | null = null;
    if (filters.teacher) {
      const teachers = await loadCatalog<Teacher>((start, end) => client.from('docentes').select('id,nombre,apellidos').order('id').range(start, end));
      teacherIds = teachers.filter(t => matches(teacherName(t), filters.teacher)).map(t => t.id);
    }
    if (filters.group) {
      const groups = await loadCatalog<Group>((start, end) => client.from('grupos').select('id,clave').eq('cuatrimestre_id', filters.cycleId).order('id').range(start, end));
      groupIds = groups.filter(g => matches(groupName(g), filters.group)).map(g => g.id);
    }
    if ((teacherIds && teacherIds.length > MAX_FILTER_IDS) || (groupIds && groupIds.length > MAX_FILTER_IDS)) {
      return json({ error: 'Acotá filtro' }, 400);
    }
    if (teacherIds?.length === 0 || groupIds?.length === 0) return json({ comentarios: [], total: 0, page: filters.page });

    let query = client.from('encuesta_estudiantil_respuestas')
      .select('id,docente_id,grupo_id,comentario_abierto,comentario_validado,comentario_no_autorizado,comentario_sin_aporte', { count: 'exact' })
      .eq('cuatrimestre_id', filters.cycleId).not('comentario_abierto', 'is', null);
    if (filters.state === 'validados') query = query.eq('comentario_validado', true);
    else if (filters.state === 'no_autorizados') query = query.eq('comentario_no_autorizado', true);
    else if (filters.state === 'sin_aporte') query = query.eq('comentario_sin_aporte', true);
    else if (filters.state === 'pendientes') query = query.eq('comentario_validado', false).eq('comentario_no_autorizado', false).eq('comentario_sin_aporte', false);
    if (filters.keyword) query = query.ilike('comentario_abierto', literalCommentLike(filters.keyword));
    if (teacherIds) query = query.in('docente_id', teacherIds);
    if (groupIds) query = query.in('grupo_id', groupIds);
    const offset = (filters.page - 1) * PAGE_SIZE;
    const result = await query.order('docente_id').order('grupo_id').order('comentario_abierto').order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error || !result.data || result.count === null) throw new Error('query');
    const rows = result.data as Comment[];
    // No full-catalog read when filtering by neither label: resolve only page IDs.
    const teacherPageIds = [...new Set(rows.map(r => r.docente_id))];
    const groupPageIds = [...new Set(rows.map(r => r.grupo_id))];
    const [teachers, groups] = await Promise.all([
      teacherPageIds.length ? client.from('docentes').select('id,nombre,apellidos').in('id', teacherPageIds) : Promise.resolve({ data: [], error: null }),
      groupPageIds.length ? client.from('grupos').select('id,clave').in('id', groupPageIds).eq('cuatrimestre_id', filters.cycleId) : Promise.resolve({ data: [], error: null }),
    ]);
    if (teachers.error || groups.error || !teachers.data || !groups.data || teachers.data.length !== teacherPageIds.length || groups.data.length !== groupPageIds.length) throw new Error('labels');
    const names = new Map((teachers.data as Teacher[]).map(t => [t.id, teacherName(t)]));
    const keys = new Map((groups.data as Group[]).map(g => [g.id, groupName(g)]));
    const comentarios = rows.map(row => commentDTO(row, names.get(row.docente_id) || 'Docente no disponible', keys.get(row.grupo_id) || 'Grupo no disponible'));
    // Whitespace-only comments are excluded without allowing an incomplete page to masquerade as a full result.
    if (comentarios.some(c => !c)) return json({ error: 'No se pudieron cargar los comentarios completos' }, 503);
    return json({ comentarios, total: result.count, page: filters.page });
  } catch {
    return json({ error: 'No se pudieron cargar los comentarios completos' }, 503);
  }
};

// Saves one page of decisions: validated comments become visible to their teacher, "no autorizado"
// ones are marked as rejected, and withdrawn ones go back to pending. Only validated comments reach the teacher.
export const PATCH: APIRoute = async ({ cookies, request }) => {
  let userId: string;
  try {
    userId = (await requireRole(cookies, ['superadmin'])).user.id;
  } catch (error) {
    if (error instanceof AuthError) {
      const body = await error.response.json().catch(() => ({ error: 'No autorizado' }));
      return json(body, error.response.status);
    }
    return json({ error: 'Error interno' }, 500);
  }

  let body: unknown;
  try { body = await boundedBody(request); }
  catch { return json({ error: 'Solicitud inválida' }, 400); }

  try {
    const client = dbAdmin();
    const cycles = await loadCatalog<{ id: number }>((start, end) => client.from('cuatrimestres').select('id').order('id').range(start, end));
    const decision = parseValidationRequest(body, cycles.map(c => c.id));
    if (!decision) return json({ error: 'Solicitud inválida' }, 400);

    const now = new Date().toISOString();
    let validated = 0;
    let withdrawn = 0;
    let rejected = 0;
    let noContribution = 0;
    if (decision.validate.length) {
      const result = await client.from('encuesta_estudiantil_respuestas')
        .update({ comentario_validado: true, comentario_no_autorizado: false, comentario_sin_aporte: false, comentario_validado_at: now, comentario_validado_por: userId })
        .eq('cuatrimestre_id', decision.cycleId).in('id', decision.validate).not('comentario_abierto', 'is', null)
        .select('id');
      if (result.error) throw new Error('validate');
      validated = result.data.length;
    }
    if (decision.unvalidate.length) {
      const result = await client.from('encuesta_estudiantil_respuestas')
        .update({ comentario_validado: false, comentario_no_autorizado: false, comentario_sin_aporte: false, comentario_validado_at: now, comentario_validado_por: userId })
        .eq('cuatrimestre_id', decision.cycleId).in('id', decision.unvalidate)
        .select('id');
      if (result.error) throw new Error('unvalidate');
      withdrawn = result.data.length;
    }
    if (decision.reject.length) {
      const result = await client.from('encuesta_estudiantil_respuestas')
        .update({ comentario_validado: false, comentario_no_autorizado: true, comentario_sin_aporte: false, comentario_validado_at: now, comentario_validado_por: userId })
        .eq('cuatrimestre_id', decision.cycleId).in('id', decision.reject).not('comentario_abierto', 'is', null)
        .select('id');
      if (result.error) throw new Error('reject');
      rejected = result.data.length;
    }
    if (decision.noContribution.length) {
      const result = await client.from('encuesta_estudiantil_respuestas')
        .update({ comentario_validado: false, comentario_no_autorizado: false, comentario_sin_aporte: true, comentario_validado_at: now, comentario_validado_por: userId })
        .eq('cuatrimestre_id', decision.cycleId).in('id', decision.noContribution).not('comentario_abierto', 'is', null)
        .select('id');
      if (result.error) throw new Error('no contribution');
      noContribution = result.data.length;
    }
    return json({ validados: validated, retirados: withdrawn, no_autorizados: rejected, sin_aporte: noContribution });
  } catch {
    return json({ error: 'No se pudo guardar la validación' }, 503);
  }
};
