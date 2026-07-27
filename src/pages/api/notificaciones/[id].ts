import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { marcarLeida } from '../../../services/notificaciones';

export const POST: APIRoute = async ({ params, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  const id = parseInt(params.id || '0');
  if (!id) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    await marcarLeida(id);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
