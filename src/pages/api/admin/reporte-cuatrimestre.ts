import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fetchBatchScoresPorDocente, calcFinalScore } from '../../../services/scoring';

export const GET: APIRoute = async ({ url, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response('No autorizado', { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response('Sesión inválida', { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || (u.rol !== 'superadmin' && u.rol !== 'coordinador')) return new Response('Solo superadmin o coordinador', { status: 403 });

    const cuatrimestreId = parseInt(url.searchParams.get('cuatrimestre_id') || '');
    if (!cuatrimestreId) return new Response(JSON.stringify({ error: 'cuatrimestre_id requerido' }), { status: 400 });

    const { data: cuatri } = await cl.from('cuatrimestres').select('clave').eq('id', cuatrimestreId).maybeSingle();

    let docIds: number[];
    if (u.rol === 'superadmin') {
      const { data: allDocs } = await cl.from('docentes').select('id').eq('activo', true);
      docIds = (allDocs || []).map(d => d.id);
    } else {
      const { data: asigs } = await cl.from('coordinador_docentes').select('docente_id').eq('coordinador_id', s.user.id).eq('cuatrimestre_id', cuatrimestreId);
      docIds = [...new Set((asigs || []).map(a => a.docente_id))];
    }

    const { data: docentes } = docIds.length
      ? await cl.from('docentes').select('id,nombre,apellidos,email').in('id', docIds).order('apellidos')
      : { data: [] };

    const scoreMap = await fetchBatchScoresPorDocente(cl, docIds, cuatrimestreId);

    const header = 'Nombre,Apellidos,Email,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos';
    const rows: string[] = [];
    for (const d of docentes || []) {
      const scores = scoreMap.get(d.id) || { ee: 0, coord: 0, plan: 0, obs: 0, auto: 0 };
      const { final, instrumentCount, category } = calcFinalScore(scores);
      rows.push(`"${d.nombre}","${d.apellidos}","${d.email}",${scores.ee || 0},${scores.coord || 0},${scores.plan || 0},${scores.obs || 0},${scores.auto || 0},${final || 0},"${category}",${instrumentCount}`);
    }

    const csv = [header, ...rows].join('\n');
    const filename = `reporte_${cuatri?.clave || cuatrimestreId}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response('Error interno', { status: 500 });
  }
};
