import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const GET: APIRoute = async ({ url, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response('[]', { status: 401, headers: { 'Content-Type': 'application/json' } });

  const cl = obtenerClienteSuperbase();
  try {
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response('[]', { status: 401, headers: { 'Content-Type': 'application/json' } });

    const all = url.searchParams.get('all');
    if (all === '1') {
      const { data: docs } = await cl.from('docentes').select('id,nombre,apellidos,email').eq('activo', true).order('apellidos');
      return new Response(JSON.stringify(docs || []), { headers: { 'Content-Type': 'application/json' } });
    }
    const cId = url.searchParams.get('coordinador');
    if (!cId) return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    const { data: o } = await cl.from('observaciones').select('docente_id').eq('evaluador_id', cId);
    const { data: c } = await cl.from('evaluacion_coordinacion').select('docente_id').eq('evaluador_id', cId);
    const ids = [...new Set([...(o||[]).map(x=>x.docente_id),...(c||[]).map(x=>x.docente_id)])];
    if (ids.length === 0) return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    const { data: docs } = await cl.from('docentes').select('nombre,apellidos,email').in('id', ids);
    return new Response(JSON.stringify(docs || []), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('[]', { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
