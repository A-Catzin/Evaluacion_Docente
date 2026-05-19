import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerUsuarioAutenticado } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await obtenerUsuarioAutenticado(cookies);
  if (!user || !['superadmin','coordinador'].includes(user.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
  const body = await request.json();
  const cl = obtenerClienteSuperbase();
  const { data, error } = await cl.from('observaciones').insert({ ...body, evaluador_id: user.id }).select('id').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201 });
};
