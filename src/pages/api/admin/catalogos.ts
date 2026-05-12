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
    const { data: admin } = await cliente.from('usuarios').select('rol').eq('id', sesion.user.id).maybeSingle();
    if (!admin || admin.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo superadmin' }), { status: 403 });

    const { action, tabla, id, nombre, activa } = await request.json();
    if (action === 'create' && nombre?.trim()) {
      const { error } = await cliente.from(tabla).insert({ nombre: nombre.trim() });
      if (error) return new Response(JSON.stringify({ error: 'Error' }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    if (action === 'toggle' && id) {
      const { error } = await cliente.from(tabla).update({ activo: activa }).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: 'Error' }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
  } catch { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
