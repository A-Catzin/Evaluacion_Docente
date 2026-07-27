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
    if (!u || !['superadmin','coordinador','observador'].includes(u.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });

    const body = await request.json();
    
    // Mapear campos de observaciones virtual/ejecutivo a columnas reales
    const mapaObs: Record<string,string> = {
      obs_cco: 'obs_cognitivas', obs_cme: 'obs_metacognitivas', obs_ccom: 'obs_comunicativas',
      obs_cso: 'obs_sociales', obs_cge: 'obs_gestion', obs_caf: 'obs_afectivas',
      obs_ctepe: 'obs_tecno', obs_cno: 'obs_normativa'
    };
    const datos: Record<string,any> = { evaluador_id: s.user.id };
    for (const [k, v] of Object.entries(body)) {
      datos[mapaObs[k] || k] = v;
    }
    
    const { data, error } = await cl.from('observaciones').insert(datos).select().single();
    if (error) {
      if (error.code === '23505') return new Response(JSON.stringify({ error: 'Ya existe una observación para este docente en este ciclo' }), { status: 409 });
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
