import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { fetchCuatrimestreScores, calcFinalScore, formatScoreCsv } from '../../../services/scoring';

export const GET: APIRoute = async ({ url, cookies }) => {
  const docenteId = parseInt(url.searchParams.get('docente_id') || '');
  if (!docenteId) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const cl = db();
  const token = cookies.get('sb-access-token')?.value;
  const refresh = cookies.get('sb-refresh-token')?.value;
  if (!token || !refresh) return new Response('No autorizado', { status: 401 });
  const { data: session } = await cl.auth.setSession({ access_token: token, refresh_token: refresh });
  if (!session.user) return new Response('Sesión inválida', { status: 401 });

  const { data: cuatris } = await cl.from('cuatrimestres').select('id,clave').order('id');
  const { data: docente } = await cl.from('docentes').select('modalidad').eq('id', docenteId).maybeSingle();
  if (!cuatris?.length) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const historial: any[] = [];
  let totalCycles = 0, sumFinals = 0;
  for (const c of cuatris) {
    const scores = await fetchCuatrimestreScores(cl, docenteId, c.id);
    const { final, instrumentCount, expectedInstrumentCount, category } = calcFinalScore(scores, docente?.modalidad);
    if (instrumentCount > 0) {
      historial.push({ clave: c.clave, ee: scores.ee ?? null, coord: scores.coord, plan: scores.plan, obs: scores.obs, auto: scores.auto, final, cat: category, inst: instrumentCount, expected: expectedInstrumentCount });
      totalCycles++;
      sumFinals += final;
    }
  }
  const annualAvg = totalCycles > 0 ? Math.round(sumFinals / totalCycles) : 0;

  const format = url.searchParams.get('format') || 'json';
  if (format === 'csv') {
    const header = 'Cuatrimestre,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos';
    const rows = historial.map(h => `${h.clave},${formatScoreCsv(h.ee)},${formatScoreCsv(h.coord)},${formatScoreCsv(h.plan)},${formatScoreCsv(h.obs)},${formatScoreCsv(h.auto)},${formatScoreCsv(h.final)},"${h.cat}",${h.inst}/${h.expected}`);
    const allRows = [...rows, `Promedio anual,,,,,,${formatScoreCsv(annualAvg)},,"${totalCycles} ciclo${totalCycles !== 1 ? 's' : ''}"`];
    const csv = [header, ...allRows].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reporte_anual.csv"' } });
  }

  return new Response(JSON.stringify({ historial, annual_avg: annualAvg, total_cycles: totalCycles }), { headers: { 'Content-Type': 'application/json' } });
};
