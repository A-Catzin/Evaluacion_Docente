import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerUsuarioAutenticado } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await obtenerUsuarioAutenticado(cookies);
  if (!user || user.rol !== 'estudiante') return new Response(JSON.stringify({ error: 'Solo estudiantes' }), { status: 403 });

  const body = await request.json();
  // Usar el ID real del usuario si está disponible, o el del body
  if (!body.estudiante_id) {
    const cl = obtenerClienteSuperbase();
    const { data: u } = await cl.from('usuarios').select('entidad_id').eq('id', user.id).maybeSingle();
    body.estudiante_id = u?.entidad_id;
  }
  const cl = obtenerClienteSuperbase();
  const { error } = await cl.from('encuesta_control_envio').insert(body);
  if (error && error.code !== '23505') return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
