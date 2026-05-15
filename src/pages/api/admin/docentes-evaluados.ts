import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const GET: APIRoute = async ({ url }) => {
  const cId = url.searchParams.get('coordinador');
  if (!cId) return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  const cl = obtenerClienteSuperbase();
  const { data: o } = await cl.from('observaciones').select('docente_id').eq('evaluador_id', cId);
  const { data: c } = await cl.from('evaluacion_coordinacion').select('docente_id').eq('evaluador_id', cId);
  const ids = [...new Set([...(o||[]).map(x=>x.docente_id),...(c||[]).map(x=>x.docente_id)])];
  if (ids.length === 0) return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  const { data: docs } = await cl.from('docentes').select('nombre,apellidos,email').in('id', ids);
  return new Response(JSON.stringify(docs || []), { headers: { 'Content-Type': 'application/json' } });
};
