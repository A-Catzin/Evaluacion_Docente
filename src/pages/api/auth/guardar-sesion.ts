import type { APIRoute } from 'astro';

/**
 * POST /api/auth/guardar-sesion
 *
 * Recibe access_token y refresh_token del cliente (después del
 * intercambio PKCE directo con Supabase) y los guarda en cookies
 * para que el middleware de Astro pueda leerlos.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const body = await request.json();
    const { access_token, refresh_token } = body;

    if (!access_token || !refresh_token) {
      return new Response(JSON.stringify({ error: 'Faltan tokens' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const esProduccion = import.meta.env.PROD;

    cookies.set('sb-access-token', access_token, {
      path: '/',
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    cookies.set('sb-refresh-token', refresh_token, {
      path: '/',
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
