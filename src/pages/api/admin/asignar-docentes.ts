import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  try {
    ({ client: cl } = await requireRole(cookies, ['superadmin']));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, assignment_type, evaluador_id, docente_ids, assignment_ids, cuatrimestre_id, include_all_active } = body as Record<string, unknown>;
    if (action === 'revoke') {
      if ((assignment_type !== 'coordinated' && assignment_type !== 'observation') || !Array.isArray(assignment_ids)
        || !Number.isSafeInteger(cuatrimestre_id)) {
        return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
      }
      const ids = assignment_ids.map(Number);
      if (ids.length > 500 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return new Response(JSON.stringify({ error: 'Asignaciones inválidas' }), { status: 400 });
      }
      const { data, error } = await cl.rpc('revoke_teacher_assignments', {
        p_assignment_type: assignment_type,
        p_cuatrimestre_id: cuatrimestre_id,
        p_assignment_ids: ids,
      });
      if (error) return new Response(JSON.stringify({ error: 'No se pudieron revocar las asignaciones' }), { status: 400 });
      return new Response(JSON.stringify({ success: true, count: data }), { status: 200 });
    }
    if ((assignment_type !== 'coordinated' && assignment_type !== 'observation') || typeof evaluador_id !== 'string'
      || !Array.isArray(docente_ids) || !Number.isSafeInteger(cuatrimestre_id) || typeof include_all_active !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
    }
    const ids = docente_ids.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return new Response(JSON.stringify({ error: 'Docentes inválidos' }), { status: 400 });
    }
    if (ids.length > 500) {
      return new Response(JSON.stringify({ error: 'Máximo 500 docentes por acción' }), { status: 400 });
    }
    const { data, error } = await cl.rpc('assign_teacher_assignments', {
      p_assignment_type: assignment_type,
      p_actor_id: evaluador_id,
      p_cuatrimestre_id: cuatrimestre_id,
      p_docente_ids: ids,
      p_include_all_active: include_all_active,
    });
    if (error) return new Response(JSON.stringify({ error: 'No se pudieron guardar las asignaciones' }), { status: 400 });
    return new Response(JSON.stringify({ success: true, count: data }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
