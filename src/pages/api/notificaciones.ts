import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { listarNotificaciones, contarNoLeidas, marcarTodasLeidas } from '../../services/notificaciones';

export const GET: APIRoute = async ({ cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const notificaciones = await listarNotificaciones(s.user.id);
    const noLeidas = await contarNoLeidas(s.user.id);
    return new Response(JSON.stringify({ notificaciones, noLeidas }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    await marcarTodasLeidas(s.user.id);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
