import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerUsuarioAutenticado } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await obtenerUsuarioAutenticado(cookies);
  if (!user || user.rol !== 'estudiante') return new Response(JSON.stringify({ error: 'Solo estudiantes' }), { status: 403 });

  const body = await request.json();
  const cliente = obtenerClienteSuperbase();
  const { data, error } = await cliente.from('encuesta_estudiantil').insert(body).select('id').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201 });
};
