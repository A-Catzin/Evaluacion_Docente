import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const GET: APIRoute = async ({ url, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response('No autorizado', { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response('Sesión inválida', { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response('Solo superadmin', { status: 403 });

    const cuatrimestreId = url.searchParams.get('cuatrimestre_id');
    if (!cuatrimestreId) return new Response(JSON.stringify({ error: 'cuatrimestre_id requerido' }), { status: 400 });

    // Obtener nombre del cuatrimestre
    const { data: cuatri } = await cl.from('cuatrimestres').select('clave,nombre').eq('id', cuatrimestreId).maybeSingle();

    // Docentes con evaluaciones (todos los cuatrimestres — ciclo de Saeko no referencia cuatrimestre_id)
    const { data: docsEval } = await cl.from('encuesta_estudiantil').select('docente_id').limit(10000);
    const evalsSet = new Set((docsEval || []).map(e => e.docente_id));
    const { data: docentes } = await cl.from('docentes').select('id,nombre,apellidos,email').eq('activo', true).order('apellidos');
    const docs = (docentes || []).filter(d => evalsSet.has(d.id));

    const ids = docs.map(d => d.id);

    const [{ data: eeData }, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }] = await Promise.all([
      cl.from('encuesta_estudiantil').select('docente_id,asignatura_id,score_normalizado').in('docente_id', ids),
      cl.from('evaluacion_coordinacion').select('docente_id,score_normalizado').in('docente_id', ids).order('id', { ascending: false }),
      cl.from('planeaciones').select('docente_id,asignatura_id,puntaje_promedio').in('docente_id', ids).eq('estado', 'Aprobado').order('fecha_evaluacion', { ascending: false }),
      cl.from('observaciones').select('docente_id,asignatura_id,cco1,cco2,cco3,cco4,cco5,cco6,cco7,cme1,cme2,cme3,cme4,cme5,cme6,cme7,cme8,cme9,ccom1,ccom2,ccom3,ccom4,cso1,cso2,cso3,cso4,cge1,cge2,cge3,cge4,cge5,cge6,cge7,caf1,caf2,ctepe1,ctepe2,ctepe3,ctepe4,ctepe5,ctepe6,ctepe7,cno1,cno2,cno3,cno4,cno5').in('docente_id', ids),
      cl.from('autodiagnosticos').select('docente_id,puntaje_total').in('docente_id', ids).order('id', { ascending: false }),
    ]);

    // Construir scores
    const eePorDocente = new Map<number, Map<number, number>>();
    for (const e of (eeData || [])) { if (!eePorDocente.has(e.docente_id)) eePorDocente.set(e.docente_id, new Map()); eePorDocente.get(e.docente_id)!.set(e.asignatura_id, e.score_normalizado); }
    const coordMap = new Map<number, number>();
    for (const c of (coordData || [])) if (!coordMap.has(c.docente_id)) coordMap.set(c.docente_id, Math.round(c.score_normalizado));
    const planPorDocente = new Map<number, Map<number, number>>();
    for (const p of (planData || [])) { if (!planPorDocente.has(p.docente_id)) planPorDocente.set(p.docente_id, new Map()); if (!planPorDocente.get(p.docente_id)!.has(p.asignatura_id)) planPorDocente.get(p.docente_id)!.set(p.asignatura_id, p.puntaje_promedio); }
    const obsPorDocente = new Map<number, Map<number, number>>();
    for (const o of (obsData || [])) { const r2 = [o.cco1,o.cco2,o.cco3,o.cco4,o.cco5,o.cco6,o.cco7,o.cme1,o.cme2,o.cme3,o.cme4,o.cme5,o.cme6,o.cme7,o.cme8,o.cme9,o.ccom1,o.ccom2,o.ccom3,o.ccom4,o.cso1,o.cso2,o.cso3,o.cso4,o.cge1,o.cge2,o.cge3,o.cge4,o.cge5,o.cge6,o.cge7,o.caf1,o.caf2,o.ctepe1,o.ctepe2,o.ctepe3,o.ctepe4,o.ctepe5,o.ctepe6,o.ctepe7,o.cno1,o.cno2,o.cno3,o.cno4,o.cno5].filter(v=>v); if (r2.length === 0) continue; const prom = Math.round((r2.reduce((a,b)=>a+b,0)/(r2.length*5))*100); if (!obsPorDocente.has(o.docente_id)) obsPorDocente.set(o.docente_id, new Map()); obsPorDocente.get(o.docente_id)!.set(o.asignatura_id, prom); }
    const diagMap = new Map<number, number>();
    for (const d of (diagData || [])) if (!diagMap.has(d.docente_id)) diagMap.set(d.docente_id, Math.round((d.puntaje_total/120)*100));

    const { data: gruposData } = await cl.from('grupos').select('docente_id,asignatura_id').in('docente_id', ids);
    const matPorDocente = new Map<number, Set<number>>();
    for (const g of (gruposData || [])) { if (!matPorDocente.has(g.docente_id)) matPorDocente.set(g.docente_id, new Set()); matPorDocente.get(g.docente_id)!.add(g.asignatura_id); }

    // Generar CSV
    const header = 'Nombre,Apellidos,Email,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos';
    const rows: string[] = [];
    for (const d of docs) {
      const eeMap = eePorDocente.get(d.id); const obsMap2 = obsPorDocente.get(d.id); const planMap2 = planPorDocente.get(d.id);
      const materias = matPorDocente.get(d.id);
      let sumEst=0,sumObs2=0,sumPlan2=0,count=0;
      if (materias) for (const asigId of materias) { const est=eeMap?.get(asigId);const obs=obsMap2?.get(asigId);const plan=planMap2?.get(asigId);if(est||obs||plan)count++;if(est)sumEst+=est;if(obs)sumObs2+=obs;if(plan)sumPlan2+=plan; }
      const promEst=count>0?Math.round(sumEst/count):0;const promObs=count>0?Math.round(sumObs2/count):0;const promPlan=count>0?Math.round(sumPlan2/count):0;
      const promCoord=coordMap.get(d.id)||0;const promAuto=diagMap.get(d.id)||0;
      let final360=0;const pesos=[0.35,0.20,0.15,0.25,0.05];const disp=[promEst,promCoord,promPlan,promObs,promAuto];
      for(let i=0;i<5;i++)if(disp[i])final360+=disp[i]*pesos[i];
      const inst=[promEst>0?1:0,promCoord>0?1:0,promPlan>0?1:0,promObs>0?1:0,promAuto>0?1:0];
      const instTotal=inst.reduce((a,b)=>a+b,0);
      const cat=instTotal===5?(final360>=90?'Sobresaliente':final360>=80?'Distinguido':final360>=70?'Bueno':final360>=60?'Aprobado':final360>=50?'A mejorar':'Insuficiente'):final360>0?'Parcial':'No Iniciado';
      rows.push(`"${d.nombre}","${d.apellidos}","${d.email}",${promEst||0},${promCoord||0},${promPlan||0},${promObs||0},${promAuto||0},${Math.round(final360)||0},"${cat}",${instTotal}`);
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
  } catch (err) {
    return new Response('Error interno', { status: 500 });
  }
};
