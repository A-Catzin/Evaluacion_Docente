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
    const { action } = body;

    if (action === 'create') {
      const { clave, nombre, oferta_academica_id, creditos } = body;
      if (!nombre?.trim()) return new Response(JSON.stringify({ error: 'Nombre requerido' }), { status: 400 });
      const { data, error } = await cl.from('asignaturas').insert({ clave, nombre: nombre.trim(), oferta_academica_id: oferta_academica_id || null, creditos: creditos || 5 }).select().single();
      if (error) return new Response(JSON.stringify({ error: 'Error al crear' }), { status: 400 });
      return new Response(JSON.stringify({ success: true, asignatura: data }), { status: 201 });
    }
    if (action === 'delete') {
      const { id } = body;
      const { error } = await cl.from('asignaturas').delete().eq('id', id);
      if (error) return new Response(JSON.stringify({ error: 'Error al eliminar' }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400 });
  } catch { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
