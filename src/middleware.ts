import { defineMiddleware } from 'astro:middleware';

const DOMINIO_PERMITIDO = '@tecplayacar.edu.mx';

const RUTAS_PUBLICAS = [
  '/api/auth/guardar-sesion',
  '/api/auth/signout',
  '/auth',
  '/',
  '/favicon.ico',
  '/favicon.svg',
];

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  // Rutas públicas sin validación
  if (esRutaPublica(url.pathname)) {
    return next();
  }

  // Verificar cookies de sesión
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;

  if (!tokenAcceso || !tokenRefresco) {
    console.log('[SED-360] Sin cookies, redirigiendo a /auth');
    return redirect('/auth');
  }

  console.log('[SED-360] Cookies OK, path:', url.pathname);
  return next();
});
