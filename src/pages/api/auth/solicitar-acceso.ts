import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });

    const body = await request.json();
    const { rol_solicitado } = body;
    if (!['docente','coordinador','observador'].includes(rol_solicitado)) {
      return new Response(JSON.stringify({ error: 'Rol no válido' }), { status: 400 });
    }

    // Actualizar el rol_solicitado en usuarios
    const { error } = await cl.from('usuarios').update({ rol_solicitado }).eq('id', s.user.id);
    if (error) return new Response(JSON.stringify({ error: 'Error al guardar' }), { status: 400 });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
