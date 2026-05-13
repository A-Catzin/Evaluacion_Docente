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
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || !['superadmin','coordinador'].includes(u.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });

    const body = await request.json();
    const { id, criterio_alineacion, criterio_secuencia, criterio_recursos, criterio_evaluacion, estado, comentario_retroalimentacion, comentario_interno } = body;
    const puntaje = Math.min(99.99, Math.round(((criterio_alineacion + criterio_secuencia + criterio_recursos + criterio_evaluacion) / 20) * 100 * 100) / 100);

    const { error } = await cl.from('planeaciones').update({
      criterio_alineacion, criterio_secuencia, criterio_recursos, criterio_evaluacion,
      puntaje_promedio: puntaje, estado, comentario_retroalimentacion: comentario_retroalimentacion || null,
      comentario_interno: comentario_interno || null, fecha_evaluacion: new Date().toISOString()
    }).eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({ success: true, puntaje }), { status: 200 });
  } catch (err) { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
