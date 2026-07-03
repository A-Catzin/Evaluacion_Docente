import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo superadmin' }), { status: 403 });

    const body = await request.json();
    const { evaluador_id, docente_ids, cuatrimestre_id } = body;
    if (!evaluador_id || !Array.isArray(docente_ids)) return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });

    // Borrar asignaciones actuales para este evaluador + cuatrimestre
    await cl.from('coordinador_docentes').delete().eq('coordinador_id', evaluador_id).eq('cuatrimestre_id', cuatrimestre_id);

    // Insertar nuevas
    if (docente_ids.length > 0) {
      const inserts = docente_ids.map(did => ({ coordinador_id: evaluador_id, docente_id: did, cuatrimestre_id }));
      const { error } = await cl.from('coordinador_docentes').insert(inserts);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, count: docente_ids.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
