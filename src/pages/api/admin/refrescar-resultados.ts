import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

/**
 * API: GET /api/admin/refrescar-resultados
 *
 * Refresca la vista materializada de resultados agregados.
 * Solo accesible para roles admin, coordinador, calidad
 * (verificado por el middleware antes de llegar aquí).
 *
 * Redirige de vuelta al dashboard con el periodo seleccionado.
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const periodo = url.searchParams.get('periodo') || '';

  try {
    // Verificar sesión
    const tokenAcceso = cookies.get('sb-access-token')?.value;
    const tokenRefresco = cookies.get('sb-refresh-token')?.value;

    if (!tokenAcceso || !tokenRefresco) {
      return redirect('/auth');
    }

    const cliente = obtenerClienteSuperbase();
    const { data: datosSesion, error: errorSesion } =
      await cliente.auth.setSession({
        access_token: tokenAcceso,
        refresh_token: tokenRefresco,
      });

    if (errorSesion || !datosSesion.user) {
      return redirect('/auth');
    }

    // Ejecutar refresh de la MV
    const { error } = await cliente.rpc('refrescar_resultados');

    if (error) {
      console.error('[API Refresh] Error al refrescar MV:', error);
    }

    // Redirigir de vuelta al dashboard
    const destino = periodo
      ? `/admin/dashboard?periodo=${periodo}&refresco=ok`
      : '/admin/dashboard?refresco=ok';

    return redirect(destino);
  } catch (err) {
    console.error('[API Refresh] Error inesperado:', err);
    return redirect('/admin/dashboard?refresco=error');
  }
};
