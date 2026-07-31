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
    if (!u || u.rol !== 'superadmin') return new Response('Solo superadmin', { status: 403 });

    const { data: cuatrisOrdenados } = await cl.from('cuatrimestres').select('id,clave').order('id');
    const cuatris = cuatrisOrdenados || [];

    const cicloInicioParam = parseInt(url.searchParams.get('ciclo_inicio') || '') || cuatris[0]?.id || 0;
    const cicloFinParam = parseInt(url.searchParams.get('ciclo_fin') || '') || cuatris[cuatris.length - 1]?.id || 0;
    const idxInicio = cuatris.findIndex(c => c.id === cicloInicioParam);
    const idxFin = cuatris.findIndex(c => c.id === cicloFinParam);
    const rangeOk = idxInicio >= 0 && idxFin >= 0 && idxInicio <= idxFin && (idxFin - idxInicio) <= 2;

    if (!rangeOk) return new Response(JSON.stringify({ error: 'Rango inválido: el ciclo final debe ser igual o posterior al inicial y con diferencia máxima de 2.' }), { status: 400 });

    const cicloIdsValid = cuatris.slice(idxInicio, idxFin + 1).map(c => c.id);
    const claves = cuatris.map(c => c.clave);

    const { data: allDocs } = await cl.from('docentes').select('id,nombre,apellidos,email,campus,modalidad').eq('activo', true).order('apellidos');
    if (!allDocs?.length) {
      return new Response(JSON.stringify({ cuatrimestres: claves, docentes: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const allDocIds = allDocs.map(d => d.id);

    const scoresPorCiclo = new Map<number, Map<number, { final: number; category: string; instrumentCount: number }>>();

    for (const cid of cicloIdsValid) {
      const batchScores = await fetchBatchScoresPorDocente(cl, allDocIds, cid);
      const finalMap = new Map<number, { final: number; category: string; instrumentCount: number }>();
      for (const docId of allDocIds) {
        const scores = batchScores.get(docId) || { ee: 0, coord: 0, plan: 0, obs: 0, auto: 0 };
        const docente = allDocs?.find(d => d.id === docId);
        finalMap.set(docId, calcFinalScore(scores, docente?.modalidad));
      }
      scoresPorCiclo.set(cid, finalMap);
    }

    const resultDocentes = allDocs.flatMap(d => {
      const puntajesPorCiclo: Record<string, number | null> = {};
      let sumFinal = 0;
      let countFinal = 0;
      let tieneEnRango = false;

      for (const cid of cuatris.map(c => c.id)) {
        const fin = scoresPorCiclo.get(cid)?.get(d.id);
        if (!cicloIdsValid.includes(cid)) {
          puntajesPorCiclo[cid] = null;
          continue;
        }

        puntajesPorCiclo[cid] = fin && fin.instrumentCount > 0 ? fin.final : null;
        if (puntajesPorCiclo[cid] != null) {
          tieneEnRango = true;
          sumFinal += puntajesPorCiclo[cid]!;
          countFinal++;
        }
      }

      if (!tieneEnRango) return [];

      const promedioAnual = countFinal > 0 ? Math.round(sumFinal / countFinal) : null;

      return {
        id: d.id,
        nombre: d.nombre,
        apellidos: d.apellidos,
        email: d.email,
        campus: d.campus || '',
        modalidad: d.modalidad || '',
        puntajes: puntajesPorCiclo,
        promedio_anual: promedioAnual,
      };
    });

    const format = url.searchParams.get('format') || 'json';

    if (format === 'csv') {
      const header = ['Nombre', 'Email', 'Campus', ...claves, 'Promedio anual'].join(',');
      const rows = resultDocentes.map(d => {
        const cols = [
          `"${[d.nombre, d.apellidos].filter(Boolean).join(' ')}"`,
          `"${d.email}"`,
          `"${d.campus}"`,
          ...cuatris.map(c => d.puntajes[c.id] ?? '—'),
          d.promedio_anual ?? '—',
        ];
        return cols.join(',');
      });
      const csv = [header, ...rows].join('\n');
      const filename = `reporte_general_admin_${claves.join('_')}.csv`;
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        cuatrimestres: cuatris.map(c => ({ id: c.id, clave: c.clave })),
        docentes: resultDocentes,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
