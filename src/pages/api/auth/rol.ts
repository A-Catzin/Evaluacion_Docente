import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const GET: APIRoute = async ({ cookies }) => {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;

  if (!tokenAcceso || !tokenRefresco) {
    return new Response(JSON.stringify({ rol: null }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const cliente = obtenerClienteSuperbase();
    const { data: sesion } = await cliente.auth.setSession({
      access_token: tokenAcceso,
      refresh_token: tokenRefresco,
    });

    if (!sesion.user) {
      return new Response(JSON.stringify({ rol: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: usuario } = await cliente
      .from('usuarios')
      .select('rol')
      .eq('id', sesion.user.id)
      .maybeSingle();

    return new Response(JSON.stringify({ rol: usuario?.rol ?? 'estudiante' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ rol: 'estudiante' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
