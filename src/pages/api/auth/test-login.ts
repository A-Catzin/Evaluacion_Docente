import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { email } = await request.json();
  if (!email) return new Response(JSON.stringify({ error: 'Email requerido' }), { status: 400 });

  const ROLES: Record<string,string> = {
    'admin@test.sed360.com': 'superadmin',
    'coord@test.sed360.com': 'coordinador',
    'docente@test.sed360.com': 'docente',
    'est@test.sed360.com': 'estudiante',
  };
  const rol = ROLES[email];
  if (!rol) return new Response(JSON.stringify({ error: 'Usuario no válido' }), { status: 400 });

  try {
    const cl = obtenerClienteSuperbase();
    const { data: usuario } = await cl.from('usuarios').select('id,entidad_id').eq('email', email).maybeSingle();
    if (!usuario) return new Response(JSON.stringify({ error: 'Usuario no encontrado en BD. Ejecuta el SQL de roles primero.' }), { status: 400 });

    // Crear token de prueba con el UUID real del usuario
    const payload = { sub: usuario.id, email, rol, test: true };
    const token = 'test_token_' + btoa(JSON.stringify(payload));
    const esProd = import.meta.env.PROD;

    cookies.set('sb-access-token', token, { path: '/', httpOnly: true, secure: esProd, sameSite: 'lax', maxAge: 86400 });
    cookies.set('sb-refresh-token', token, { path: '/', httpOnly: true, secure: esProd, sameSite: 'lax', maxAge: 86400 });

    return new Response(JSON.stringify({ success: true, rol }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
