import type { APIRoute } from 'astro';
import { crearClienteConSesion, crearClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerDestinoInicio, resolverRolAutenticado } from '../../../lib/roles';

/**
 * Callback de Google OAuth — Plataforma SED-360
 *
 * Recibe el código de autorización de Google, lo intercambia por
 * una sesión de Supabase, establece las cookies y redirige al
 * dashboard del evaluador.
 *
 * Ruta pública (ver middleware.ts — RUTAS_PUBLICAS).
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');

  // Si no hay código o hay error, redirigir con mensaje
  if (!code || url.searchParams.has('error')) {
    return redirect('/auth?error=oauth');
  }

  try {
    const cliente = crearClienteSuperbase();
    const { data, error } = await cliente.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('[SED-360 Callback] Error al intercambiar código:', error?.message);
      return redirect('/auth?error=oauth');
    }

    const { access_token: tokenAcceso, refresh_token: tokenRefresco } = data.session;

    // Establecer cookies de sesión (coinciden con las que lee el middleware)
    cookies.set('sb-access-token', tokenAcceso, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 semana
    });

    cookies.set('sb-refresh-token', tokenRefresco, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 semana
    });

    const clienteSesion = crearClienteConSesion(tokenAcceso);
    const { data: usuario, error: errorUsuario } = await clienteSesion.auth.getUser(tokenAcceso);
    if (errorUsuario || !usuario.user) {
      console.error('[SED-360 Callback] No se pudo validar la sesión:', errorUsuario?.message);
      return redirect('/auth?error=sesion');
    }

    try {
      const rol = await resolverRolAutenticado(clienteSesion);
      return redirect(obtenerDestinoInicio(rol));
    } catch (error) {
      console.error('[SED-360 Callback] No se pudo resolver el rol:', error);
      return redirect('/auth?error=rol');
    }
  } catch (err) {
    console.error('[SED-360 Callback] Error inesperado:', err);
    return redirect('/auth?error=oauth');
  }
};
