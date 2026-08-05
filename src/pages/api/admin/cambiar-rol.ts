import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';

export const POST: APIRoute = async ({ request, cookies }) => {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;
  if (!tokenAcceso || !tokenRefresco) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  try {
    const cliente = db();
    const { data: sesion } = await cliente.auth.setSession({ access_token: tokenAcceso, refresh_token: tokenRefresco });
    if (!sesion.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });

    // Solo superadmin
    const { data: admin } = await cliente.from('usuarios').select('rol').eq('id', sesion.user.id).maybeSingle();
    if (!admin || admin.rol !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
    }

    const { user_id, rol } = await request.json();
    if (!user_id || !['superadmin', 'coordinador', 'docente', 'observador', 'pendiente'].includes(rol)) {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
    }

    const { data: actualizado, error } = await cliente
      .from('usuarios')
      .update({ rol })
      .eq('id', user_id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!actualizado) return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), { status: 404 });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
