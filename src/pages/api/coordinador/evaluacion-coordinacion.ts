import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerUsuarioAutenticado } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await obtenerUsuarioAutenticado(cookies);
  if (!user || !['superadmin','coordinador'].includes(user.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
  const body = await request.json();
  const cl = obtenerClienteSuperbase();
  const { data, error } = await cl.from('evaluacion_coordinacion').insert({ ...body, evaluador_id: user.id }).select('score_normalizado').single();
  if (error) return new Response(JSON.stringify({ error: error.code==='23505'?'Ya existe':error.message }), { status: 400 });
  return new Response(JSON.stringify({ success: true, score: Math.round(data.score_normalizado) }), { status: 201 });
};
