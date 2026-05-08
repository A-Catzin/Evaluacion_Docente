import { defineMiddleware } from 'astro:middleware';
import { obtenerClienteSuperbase } from './lib/supabaseClient';

/**
 * Middleware de Protección de Dominio — Plataforma SED-360
 *
 * Propósito: Validar que el usuario autenticado tenga un correo del
 * dominio institucional @tecplayacar.edu.mx. Si el correo no pertenece
 * al dominio, cierra la sesión y redirige al login.
 *
 * Dependencias:
 *   - Supabase Auth (cookies: sb-access-token, sb-refresh-token)
 *   - Cliente: src/lib/supabaseClient.ts
 *
 * Restricciones: Implementa la política de "Dominio Cerrado" definida
 * en docs/requerimientos.md. Las rutas públicas están exentas.
 *
 * Flujo:
 *   1. Obtiene la sesión desde las cookies de Supabase
 *   2. Verifica que el email termine en @tecplayacar.edu.mx
 *   3. Si no es válido, destruye la sesión y redirige a /auth
 */

/** Dominio institucional permitido */
const DOMINIO_PERMITIDO = '@tecplayacar.edu.mx';

/** Rutas públicas que no requieren autenticación */
const RUTAS_PUBLICAS = [
  '/api/auth/callback',
  '/api/auth/signout',
  '/auth',
  '/',               // Landing page
  '/favicon.ico',
  '/favicon.svg',
];

/** Roles autorizados para acceder a rutas administrativas */
export const ROLES_ADMIN = ['admin', 'coordinador', 'calidad'] as const;
export type RolAdmin = (typeof ROLES_ADMIN)[number];

/**
 * Verifica si un rol tiene acceso a rutas administrativas.
 * Helper exportable para usar en páginas y endpoints.
 */
export function esRolAutorizado(rol: string | null | undefined): rol is RolAdmin {
  return ROLES_ADMIN.includes(rol as RolAdmin);
}

/**
 * Verifica si una ruta es pública (no requiere autenticación)
 */
function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(ruta + '/'));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  // Permitir rutas públicas sin validación
  if (esRutaPublica(url.pathname)) {
    return next();
  }

  // Obtener los tokens de sesión desde las cookies de Supabase
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;

  // Si no hay sesión, redirigir al login
  if (!tokenAcceso || !tokenRefresco) {
    console.warn('[SED-360 Middleware] Sin sesión activa, redirigiendo a /auth');
    return redirect('/auth');
  }

  try {
    // Establecer la sesión con los tokens de las cookies
    const cliente = obtenerClienteSuperbase();
    const { data, error } = await cliente.auth.setSession({
      access_token: tokenAcceso,
      refresh_token: tokenRefresco,
    });

    if (error || !data.user?.email) {
      console.error('[SED-360 Middleware] Error de sesión:', error?.message);
      return redirigirAlLogin(cookies, redirect);
    }

    const email = data.user.email;

    // Validar que el correo pertenezca al dominio institucional
    if (!email.endsWith(DOMINIO_PERMITIDO)) {
      console.warn(
        `[SED-360 Middleware] Acceso denegado: ${email} no pertenece a ${DOMINIO_PERMITIDO}`
      );

      // Cerrar sesión para prevenir accesos no autorizados
      await cliente.auth.signOut();
      return redirigirAlLogin(cookies, redirect);
    }

    // ─── Autorización por rol para rutas administrativas ─────────
    if (url.pathname.startsWith('/admin')) {
      const { data: usuario, error: errorRol } = await cliente
        .from('usuarios')
        .select('rol')
        .eq('id', data.user.id)
        .single();

      if (errorRol || !usuario) {
        console.error('[SED-360 Middleware] Error al obtener rol:', errorRol?.message);
        return redirect('/?error=no-autorizado');
      }

      if (!esRolAutorizado(usuario.rol)) {
        console.warn(
          `[SED-360 Middleware] Acceso denegado a /admin: ${data.user.email} con rol ${usuario.rol}`
        );
        return redirect('/?error=no-autorizado');
      }
    }

    // Email válido y autorización aprobada: continuar con la petición
    return next();
  } catch (err) {
    console.error('[SED-360 Middleware] Error inesperado:', err);
    return redirigirAlLogin(cookies, redirect);
  }
});

/**
 * Limpia las cookies de sesión y redirige al login
 */
function redirigirAlLogin(
  cookies: { delete: (name: string) => void },
  redirect: (path: string) => Response
): Response {
  cookies.delete('sb-access-token');
  cookies.delete('sb-refresh-token');
  return redirect('/auth');
}
