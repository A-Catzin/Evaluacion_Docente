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
    const { docente_id, cuatrimestre_id, ciclo, campus, comentarios, a1,a2,a3,b1,b2,b3,c1,c2,c3,d1,d2,d3,e1,e2,e3 } = body;

    const { data, error } = await cl.from('evaluacion_coordinacion').insert({
      docente_id, cuatrimestre_id, evaluador_id: s.user.id, ciclo, campus, comentarios,
      a1,a2,a3,b1,b2,b3,c1,c2,c3,d1,d2,d3,e1,e2,e3
    }).select('puntos_obtenidos,score_normalizado').single();

    if (error) {
      if (error.code === '23505') return new Response(JSON.stringify({ error: 'Ya evaluaste a este docente en este cuatrimestre' }), { status: 409 });
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
    return new Response(JSON.stringify({ success: true, puntos: data.puntos_obtenidos, score: Math.round(data.score_normalizado) }), { status: 201 });
  } catch (err) { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
