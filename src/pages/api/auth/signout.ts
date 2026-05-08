import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

/**
 * Cierre de Sesión — Plataforma SED-360
 *
 * Invalida la sesión en Supabase, limpia las cookies de autenticación
 * y redirige a la página de login.
 *
 * Ruta pública (ver middleware.ts — RUTAS_PUBLICAS).
 */
export const GET: APIRoute = async ({ cookies, redirect }) => {
  try {
    const cliente = obtenerClienteSuperbase();
    await cliente.auth.signOut();
  } catch (err) {
    console.error('[SED-360 SignOut] Error al cerrar sesión:', err);
    // Aún así limpiar cookies aunque falle signOut
  }

  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });

  return redirect('/auth');
};
