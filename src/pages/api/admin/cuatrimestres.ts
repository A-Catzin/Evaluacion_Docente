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
    const { action, id, clave, nombre, fecha_inicio, fecha_fin, activo, cerrado } = body;

    if (action === 'create') {
      if (!clave || !nombre) return new Response(JSON.stringify({ error: 'Clave y nombre requeridos' }), { status: 400 });
      const { error } = await cl.from('cuatrimestres').insert({ clave, nombre, fecha_inicio, fecha_fin, activo: activo ?? true, cerrado: cerrado ?? false });
      if (error) return new Response(JSON.stringify({ error: error.code === '23505' ? 'La clave ya existe' : error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    if (action === 'update') {
      if (!id || !nombre) return new Response(JSON.stringify({ error: 'ID y nombre requeridos' }), { status: 400 });
      const { error } = await cl.from('cuatrimestres').update({ nombre, fecha_inicio, fecha_fin, activo, cerrado }).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (action === 'delete') {
      const { error } = await cl.from('cuatrimestres').delete().eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400 });
  } catch { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
