import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request }) => {
  const { email, password } = await request.json();
  if (!email || !password) return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });

  try {
    const cl = obtenerClienteSuperbase();
    const { data, error } = await cl.auth.signInWithPassword({ email, password });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    if (!data.user) return new Response(JSON.stringify({ error: 'No se pudo crear sesión' }), { status: 400 });
    return new Response(JSON.stringify({ success: true, email: data.user.email }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
