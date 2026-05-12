import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;
  if (!tokenAcceso || !tokenRefresco) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  try {
    const cliente = obtenerClienteSuperbase();
    const { data: sesion } = await cliente.auth.setSession({ access_token: tokenAcceso, refresh_token: tokenRefresco });
    if (!sesion.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });

    // Solo superadmin
    const { data: admin } = await cliente.from('usuarios').select('rol').eq('id', sesion.user.id).maybeSingle();
    if (!admin || admin.rol !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
    }

    const { user_id, rol } = await request.json();
    if (!user_id || !['superadmin', 'coordinador', 'docente', 'estudiante'].includes(rol)) {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
    }

    const { error } = await cliente.from('usuarios').update({ rol }).eq('id', user_id);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
