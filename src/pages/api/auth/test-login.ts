import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

const TOKEN_PREFIJO = 'test_token_';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { rol, email, nombre } = body;
    if (!rol || !email) return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });

    // Buscar o crear usuario de prueba en Supabase
    const cl = obtenerClienteSuperbase();
    const { data: existente } = await cl.from('usuarios').select('id,entidad_id').eq('email', email).maybeSingle();

    if (!existente) {
      return new Response(JSON.stringify({ error: 'Usuario de prueba no encontrado. Ejecuta la migración de test primero.' }), { status: 400 });
    }

    // Actualizar rol si es necesario
    await cl.from('usuarios').update({ rol }).eq('id', existente.id);

    // Crear token de prueba (JWT simulado con el ID real del usuario)
    const tokenData = btoa(JSON.stringify({ sub: existente.id, email, rol, nombre, test: true }));
    const token = TOKEN_PREFIJO + tokenData;

    const esProduccion = import.meta.env.PROD;
    cookies.set('sb-access-token', token, { path: '/', httpOnly: true, secure: esProduccion, sameSite: 'lax', maxAge: 86400 });
    cookies.set('sb-refresh-token', token, { path: '/', httpOnly: true, secure: esProduccion, sameSite: 'lax', maxAge: 86400 });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
