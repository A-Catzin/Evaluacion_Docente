import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request }) => {
  try {
    const cl = obtenerClienteSuperbase();
    const body = await request.json();
    const { error } = await cl.from('encuesta_control_envio').insert(body);
    if (error && error.code !== '23505') return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch { return new Response(JSON.stringify({ error: 'Error' }), { status: 500 }); }
};
