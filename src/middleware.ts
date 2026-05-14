import { defineMiddleware } from 'astro:middleware';
import { obtenerClienteSuperbase } from './lib/supabaseClient';

const DOMINIO_PERMITIDO = '@tecplayacar.edu.mx';

const RUTAS_PUBLICAS = [
  '/api/auth/guardar-sesion', '/api/auth/signout', '/api/auth/rol',
  '/api/docente/autodiagnostico', '/api/coordinador/observacion',
  '/api/docente/planeacion', '/api/coordinador/planeacion', '/api/coordinador/evaluacion-coordinacion',
  '/auth', '/', '/favicon.ico', '/favicon.svg',
];

const ROLES_POR_RUTA: Record<string, string[]> = {
  '/admin': ['superadmin'],
  '/coordinador': ['coordinador', 'superadmin'],
  '/docente': ['docente', 'superadmin', 'coordinador'],
  '/estudiante': ['estudiante', 'superadmin'],
};

function esRutaPublica(p: string): boolean {
  return RUTAS_PUBLICAS.some((r) => p === r || p.startsWith(r + '/'));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  if (esRutaPublica(url.pathname)) return next();

  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;

  if (!tokenAcceso || !tokenRefresco) return redirect('/auth');

  try {
    const cliente = obtenerClienteSuperbase();
    const { data, error } = await cliente.auth.setSession({
      access_token: tokenAcceso,
      refresh_token: tokenRefresco,
    });

    if (error || !data.user?.email) return redirect('/auth');
    if (!data.user.email.endsWith(DOMINIO_PERMITIDO)) {
      await cliente.auth.signOut();
      cookies.delete('sb-access-token');
      cookies.delete('sb-refresh-token');
      return redirect('/auth');
    }

    // Autorización por rol
    for (const [prefijo, roles] of Object.entries(ROLES_POR_RUTA)) {
      if (url.pathname.startsWith(prefijo)) {
        const { data: usuario } = await cliente
          .from('usuarios').select('rol').eq('id', data.user.id).maybeSingle();

        if (!usuario || !roles.includes(usuario.rol)) {
          return redirect('/?error=no-autorizado');
        }
        break;
      }
    }

    return next();
  } catch {
    return redirect('/auth');
  }
});
