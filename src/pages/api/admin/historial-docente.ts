import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const GET: APIRoute = async ({ url }) => {
  const docenteId = parseInt(url.searchParams.get('docente_id') || '');
  if (!docenteId) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const cl = obtenerClienteSuperbase();

  // Obtener todos los cuatrimestres
  const { data: cuatris } = await cl.from('cuatrimestres').select('id,clave').order('id');
  if (!cuatris?.length) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const historial: any[] = [];
  for (const c of cuatris) {
    const [{ data: eeData }, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }] = await Promise.all([
      cl.from('encuesta_estudiantil').select('score_normalizado').eq('docente_id', docenteId).eq('cuatrimestre_id', c.id),
      cl.from('evaluacion_coordinacion').select('score_normalizado').eq('docente_id', docenteId).eq('cuatrimestre_id', c.id).order('id',{ascending:false}).limit(1),
      cl.from('planeaciones').select('puntaje_promedio').eq('docente_id', docenteId).eq('cuatrimestre_id', c.id).eq('estado','Aprobado'),
      cl.from('observaciones').select('cco1,cco2,cco3,cco4,cco5,cco6,cco7,cme1,cme2,cme3,cme4,cme5,cme6,cme7,cme8,cme9,ccom1,ccom2,ccom3,ccom4,cso1,cso2,cso3,cso4,cge1,cge2,cge3,cge4,cge5,cge6,cge7,caf1,caf2,ctepe1,ctepe2,ctepe3,ctepe4,ctepe5,ctepe6,ctepe7,cno1,cno2,cno3,cno4,cno5').eq('docente_id', docenteId).eq('cuatrimestre_id', c.id),
      cl.from('autodiagnosticos').select('puntaje_total').eq('docente_id', docenteId).eq('cuatrimestre_id', c.id).order('id',{ascending:false}).limit(1),
    ]);

    const promEst = eeData?.length ? Math.round(eeData.reduce((s,e)=>s+e.score_normalizado,0)/eeData.length) : 0;
    const promCoord = coordData?.[0]?.score_normalizado ? Math.round(coordData[0].score_normalizado) : 0;
    const promPlan = planData?.length ? Math.round(planData.reduce((s,p)=>s+p.puntaje_promedio,0)/planData.length) : 0;
    let promObs = 0; for(const o of(obsData||[])){const r=[o.cco1,o.cco2,o.cco3,o.cco4,o.cco5,o.cco6,o.cco7,o.cme1,o.cme2,o.cme3,o.cme4,o.cme5,o.cme6,o.cme7,o.cme8,o.cme9,o.ccom1,o.ccom2,o.ccom3,o.ccom4,o.cso1,o.cso2,o.cso3,o.cso4,o.cge1,o.cge2,o.cge3,o.cge4,o.cge5,o.cge6,o.cge7,o.caf1,o.caf2,o.ctepe1,o.ctepe2,o.ctepe3,o.ctepe4,o.ctepe5,o.ctepe6,o.ctepe7,o.cno1,o.cno2,o.cno3,o.cno4,o.cno5].filter(v=>v);if(r.length)promObs=Math.round((r.reduce((a,b)=>a+b,0)/(r.length*5))*100)}
    const promAuto = diagData?.[0]?.puntaje_total ? Math.round((diagData[0].puntaje_total/120)*100) : 0;
    const disp = [promEst,promCoord,promPlan,promObs,promAuto]; const pesos = [0.35,0.20,0.15,0.25,0.05];
    let fin = 0; for(let i=0;i<5;i++)if(disp[i])fin+=disp[i]*pesos[i];
    const inst = disp.filter(v=>v>0).length;
    const cat = inst===5?(fin>=90?'Sobresaliente':fin>=80?'Distinguido':fin>=70?'Bueno':fin>=60?'Aprobado':fin>=50?'A mejorar':'Insuficiente'):fin>0?'Parcial':'No iniciado';

    if (inst > 0) historial.push({ clave: c.clave, ee: promEst, coord: promCoord, plan: promPlan, obs: promObs, auto: promAuto, final: Math.round(fin), cat, inst });
  }

  const format = url.searchParams.get('format') || 'json';
  if (format === 'csv') {
    const header = 'Cuatrimestre,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos';
    const rows = historial.map(h => `${h.clave},${h.ee},${h.coord},${h.plan},${h.obs},${h.auto},${h.final},"${h.cat}",${h.inst}`);
    const csv = [header, ...rows].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reporte_anual.csv"' } });
  }

  return new Response(JSON.stringify(historial), { headers: { 'Content-Type': 'application/json' } });
};
