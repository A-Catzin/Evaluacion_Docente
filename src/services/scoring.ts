/**
 * Servicio de Cálculo de Scores — lógica compartida para reportes
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const OBSERVATION_FIELDS = [
  'cco1','cco2','cco3','cco4','cco5','cco6','cco7',
  'cme1','cme2','cme3','cme4','cme5','cme6','cme7','cme8','cme9',
  'ccom1','ccom2','ccom3','ccom4',
  'cso1','cso2','cso3','cso4',
  'cge1','cge2','cge3','cge4','cge5','cge6','cge7',
  'caf1','caf2',
  'ctepe1','ctepe2','ctepe3','ctepe4','ctepe5','ctepe6','ctepe7',
  'cno1','cno2','cno3','cno4','cno5',
] as const;

export const OBSERVATION_SELECT = OBSERVATION_FIELDS.join(',');

export type ObservationRow = Record<string, number | null | undefined>;

export function calcObservationScore(row: ObservationRow): number {
  const values = OBSERVATION_FIELDS
    .map(f => row[f])
    .filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / (values.length * 5)) * 100);
}

export const WEIGHTS = { ee: 0.35, coord: 0.20, plan: 0.15, obs: 0.25, auto: 0.05 } as const;

export type ModalityProfile = {
  weights: InstrumentScores;
  expectedInstrumentCount: number;
};

const MODALITY_PROFILES: Record<string, ModalityProfile> = {
  normal: {
    weights: WEIGHTS,
    expectedInstrumentCount: 5,
  },
  ejecutivo: {
    weights: { ee: 0.40, coord: 0.25, plan: 0, obs: 0.30, auto: 0.05 },
    expectedInstrumentCount: 4,
  },
};

export function normalizarModalidad(modalidad?: string | null): string {
  return (modalidad || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function obtenerPerfilModalidad(modalidad?: string | null): ModalityProfile {
  const n = normalizarModalidad(modalidad);
  if (n.includes('ejecutivo') || n.includes('ingles')) return MODALITY_PROFILES.ejecutivo;
  return MODALITY_PROFILES.normal;
}

export interface InstrumentScores {
  ee: number;
  coord: number;
  plan: number;
  obs: number;
  auto: number;
}

export interface FinalScore {
  final: number;
  instrumentCount: number;
  expectedInstrumentCount: number;
  category: string;
}

export function calcFinalScore(scores: InstrumentScores, modalidad?: string | null): FinalScore {
  const { ee, coord, plan, obs, auto: autoScore } = scores;
  const profile = obtenerPerfilModalidad(modalidad);
  const instruments = [ee, coord, plan, obs, autoScore];
  const expectedInstruments = [
    profile.weights.ee,
    profile.weights.coord,
    profile.weights.plan,
    profile.weights.obs,
    profile.weights.auto,
  ];
  const count = expectedInstruments
    .map((weight, idx) => weight > 0 && instruments[idx] > 0)
    .filter(Boolean)
    .length;

  let final = 0;
  const weights = [profile.weights.ee, profile.weights.coord, profile.weights.plan, profile.weights.obs, profile.weights.auto];
  for (let i = 0; i < 5; i++) {
    if (instruments[i]) final += instruments[i] * weights[i];
  }
  final = Math.round(final);

  const category = getCategory(final, count, profile.expectedInstrumentCount);

  return { final, instrumentCount: count, expectedInstrumentCount: profile.expectedInstrumentCount, category };
}

export function getCategory(finalScore: number, instrumentCount: number, expectedInstrumentCount = 5): string {
  if (instrumentCount === expectedInstrumentCount) {
    if (finalScore >= 90) return 'Sobresaliente';
    if (finalScore >= 80) return 'Distinguido';
    if (finalScore >= 70) return 'Bueno';
    if (finalScore >= 60) return 'Aprobado';
    if (finalScore >= 50) return 'A mejorar';
    return 'Insuficiente';
  }
  return finalScore > 0 ? 'Parcial' : 'No iniciado';
}

export async function fetchCuatrimestreScores(
  cl: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number
): Promise<InstrumentScores> {
  const [{ data: eeData }, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }] =
    await Promise.all([
      cl.from('encuesta_estudiantil').select('score_normalizado').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('evaluacion_coordinacion').select('score_normalizado').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }).limit(1),
      cl.from('planeaciones').select('puntaje_promedio').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).eq('estado', 'Aprobado'),
      cl.from('observaciones').select(OBSERVATION_SELECT).eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('autodiagnosticos').select('puntaje_total').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }).limit(1),
    ]);

  const ee = (eeData as any[])?.length ? Math.round((eeData as any[]).reduce((s: number, e: any) => s + e.score_normalizado, 0) / (eeData as any[]).length) : 0;
  const coord = (coordData as any[])?.[0]?.score_normalizado ? Math.round((coordData as any[])[0].score_normalizado) : 0;
  const plan = (planData as any[])?.length ? Math.round((planData as any[]).reduce((s: number, p: any) => s + p.puntaje_promedio, 0) / (planData as any[]).length) : 0;
  let obs = 0;
  for (const o of (obsData as any[]) || []) {
    obs = calcObservationScore(o);
  }
  const auto = (diagData as any[])?.[0]?.puntaje_total ? Math.round(((diagData as any[])[0].puntaje_total / 120) * 100) : 0;

  return { ee, coord, plan, obs, auto };
}

export async function fetchBatchScoresPorDocente(
  cl: SupabaseClient,
  docenteIds: number[],
  cuatrimestreId: number
): Promise<Map<number, InstrumentScores>> {
  if (!docenteIds.length) return new Map();

  const [{ data: eeData }, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }] =
    await Promise.all([
      cl.from('encuesta_estudiantil').select('docente_id,score_normalizado').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('evaluacion_coordinacion').select('docente_id,score_normalizado').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }),
      cl.from('planeaciones').select('docente_id,puntaje_promedio').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).eq('estado', 'Aprobado'),
      cl.from('observaciones').select(`docente_id,${OBSERVATION_SELECT}`).in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('autodiagnosticos').select('docente_id,puntaje_total').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }),
    ]);

  const eeMap = new Map<number, { sum: number; count: number }>();
  for (const e of (eeData as any[]) || []) {
    const acc = eeMap.get(e.docente_id) || { sum: 0, count: 0 };
    acc.sum += e.score_normalizado;
    acc.count++;
    eeMap.set(e.docente_id, acc);
  }

  const coordMap = new Map<number, number>();
  for (const c of (coordData as any[]) || []) {
    if (!coordMap.has(c.docente_id)) coordMap.set(c.docente_id, Math.round(c.score_normalizado));
  }

  const planMap = new Map<number, { sum: number; count: number }>();
  for (const p of (planData as any[]) || []) {
    const acc = planMap.get(p.docente_id) || { sum: 0, count: 0 };
    acc.sum += p.puntaje_promedio;
    acc.count++;
    planMap.set(p.docente_id, acc);
  }

  const obsMap = new Map<number, number>();
  for (const o of (obsData as any[]) || []) {
    const score = calcObservationScore(o);
    if (score > 0 && !obsMap.has(o.docente_id)) obsMap.set(o.docente_id, score);
  }

  const diagMap = new Map<number, number>();
  for (const d of (diagData as any[]) || []) {
    if (!diagMap.has(d.docente_id)) diagMap.set(d.docente_id, Math.round((d.puntaje_total / 120) * 100));
  }

  const result = new Map<number, InstrumentScores>();
  for (const id of docenteIds) {
    const eeAcc = eeMap.get(id);
    const ee = eeAcc ? Math.round(eeAcc.sum / eeAcc.count) : 0;
    const planAcc = planMap.get(id);
    const plan = planAcc ? Math.round(planAcc.sum / planAcc.count) : 0;
    result.set(id, {
      ee,
      coord: coordMap.get(id) || 0,
      plan,
      obs: obsMap.get(id) || 0,
      auto: diagMap.get(id) || 0,
    });
  }
  return result;
}
