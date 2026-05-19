import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value, r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('entidad_id,rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'estudiante' || !u.entidad_id) return new Response(JSON.stringify({ error: 'Solo estudiantes' }), { status: 403 });

    const body = await request.json();
    const { data, error } = await cl.from('encuesta_estudiantil').insert(body).select('id').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201 });
  } catch (err) { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
