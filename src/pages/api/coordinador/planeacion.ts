import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || !['superadmin','coordinador'].includes(u.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });

    const body = await request.json();
    const { id, puntaje, estado, comentario_retroalimentacion, evaluacion_detalle, observaciones_generales, no_aplica_count } = body;

    const { error } = await cl.from('planeaciones').update({
      puntaje_promedio: puntaje, estado,
      comentario_retroalimentacion: comentario_retroalimentacion || null,
      evaluacion_detalle: evaluacion_detalle || null,
      observaciones_generales: observaciones_generales || null,
      no_aplica_count: no_aplica_count || 0,
      fecha_evaluacion: new Date().toISOString()
    }).eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

    // Notificar al docente
    try {
      const { data: plan } = await cl.from('planeaciones').select('docente_id,cuatrimestre_id').eq('id', id).maybeSingle();
      if (plan) {
        const tipo = estado === 'Aprobado' ? 'aprobada' : 'marcada para corrección';
        const { notificarDocente } = await import('../../../services/notificaciones');
        await notificarDocente(plan.docente_id, `Planeación ${tipo}`, `Tu planeación ha sido ${tipo}. Puntaje: ${puntaje}%`, `/docente/planeaciones`);
      }
    } catch {}

    return new Response(JSON.stringify({ success: true, puntaje }), { status: 200 });
  } catch (err) { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
