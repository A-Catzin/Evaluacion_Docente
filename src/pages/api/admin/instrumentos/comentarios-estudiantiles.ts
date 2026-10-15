import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../../lib/auth';
import { dbAdmin } from '../../../../lib/db';
import { loadCatalog } from '../../../../lib/adminObservationTracking';
import { commentDTO, literalCommentLike, MAX_FILTER_IDS, PAGE_SIZE, parseCommentRequest } from '../../../../lib/adminStudentCommentTracking';
import { formatPersonName } from '../../../../lib/personName';

const MAX_BODY_BYTES = 1024;
type Teacher = { id: number; nombre: string | null; apellidos: string | null };
type Group = { id: number; clave: string | null };
type Comment = { docente_id: number; grupo_id: number; comentario_abierto: string | null };

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
      .select('docente_id,grupo_id,comentario_abierto', { count: 'exact' })
      .eq('cuatrimestre_id', filters.cycleId).not('comentario_abierto', 'is', null);
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
