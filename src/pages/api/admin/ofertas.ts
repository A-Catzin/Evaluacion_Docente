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

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { nombre } = body;
      if (!nombre?.trim()) return new Response(JSON.stringify({ error: 'Nombre requerido' }), { status: 400 });
      const { data, error } = await cliente.from('ofertas_academicas').insert({ nombre: nombre.trim() }).select().single();
      if (error) return new Response(JSON.stringify({ error: error.code === '23505' ? 'Ya existe' : 'Error al crear' }), { status: 400 });
      return new Response(JSON.stringify({ success: true, oferta: data }), { status: 201 });
    }

    if (action === 'update') {
      const { id, nombre, activa } = body;
      if (!id || !nombre?.trim()) return new Response(JSON.stringify({ error: 'Datos requeridos' }), { status: 400 });
      const { error } = await cliente.from('ofertas_academicas').update({ nombre: nombre.trim(), activa }).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: 'Error al actualizar' }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if (action === 'toggle') {
      const { id, activa } = body;
      const { error } = await cliente.from('ofertas_academicas').update({ activa }).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: 'Error' }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400 });
  } catch {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
