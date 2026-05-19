import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

const TEST_USERS = [
  { email: 'admin@test.local', password: 'test123', rol: 'superadmin' },
  { email: 'coord@test.local', password: 'test123', rol: 'coordinador' },
  { email: 'docente@test.local', password: 'test123', rol: 'docente' },
  { email: 'est@test.local', password: 'test123', rol: 'estudiante' },
];

export const POST: APIRoute = async ({ request }) => {
  const { email, password } = await request.json();
  const user = TEST_USERS.find(u => u.email === email);
  if (!user) return new Response(JSON.stringify({ error: 'Usuario no válido' }), { status: 400 });

  try {
    const cl = obtenerClienteSuperbase();
    // Intentar login
    let { data, error } = await cl.auth.signInWithPassword({ email, password });
    
    // Si no existe, crearlo
    if (error && error.message?.includes('Invalid login')) {
      const { error: signUpErr } = await cl.auth.signUp({ email, password });
      if (signUpErr) return new Response(JSON.stringify({ error: signUpErr.message }), { status: 400 });
      // Reintentar login
      const retry = await cl.auth.signInWithPassword({ email, password });
      if (retry.error) return new Response(JSON.stringify({ error: retry.error.message }), { status: 400 });
      data = retry.data;
    } else if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    if (!data.user) return new Response(JSON.stringify({ error: 'No se pudo crear sesión' }), { status: 400 });

    // Asegurar rol correcto en usuarios
    await cl.from('usuarios').upsert({ id: data.user.id, email, rol: user.rol }, { onConflict: 'id' });

    return new Response(JSON.stringify({ success: true, rol: user.rol }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
