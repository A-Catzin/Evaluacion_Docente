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
  weights: Required<Omit<InstrumentScores, 'invalidPurposes'>>;
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
  ee?: number;
  coord?: number;
  plan?: number;
  obs?: number;
  auto?: number;
  invalidPurposes?: Array<'coordination' | 'planning' | 'observation'>;
}

const scoreFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatScore(value: number | null | undefined): string {
  return value != null ? scoreFormatter.format(value) : '—';
}

export function formatScoreCsv(value: number | null | undefined): string {
  return value != null ? value.toFixed(1) : '—';
}

export interface NativeStudentEvaluationScore {
  cuatrimestre_id: number;
  docente_id: number;
  asignatura_id: number;
  grupo_id: number;
  respuestas_validas: number;
  score_normalizado: number;
  version_calculo: 'native-19-v2';
}

export async function fetchNativeStudentEvaluationScores(
  cl: SupabaseClient,
  cuatrimestreId: number
): Promise<NativeStudentEvaluationScore[]> {
  if (!cuatrimestreId) return [];
  const { data, error } = await cl.rpc('obtener_scores_encuesta_estudiantil_nativa', {
    p_cuatrimestre_id: cuatrimestreId,
  });
  if (error) throw error;
  return ((data || []) as any[]).map((row) => ({
    ...row,
    respuestas_validas: Number(row.respuestas_validas),
    score_normalizado: Number(row.score_normalizado),
    version_calculo: 'native-19-v2',
  }));
}

export function aggregateNativeScoresByTeacher(
  rows: NativeStudentEvaluationScore[]
): Map<number, number> {
  const totals = new Map<number, { score: number; responses: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.score_normalizado) || row.respuestas_validas <= 0) continue;
    const total = totals.get(row.docente_id) || { score: 0, responses: 0 };
    total.score += row.score_normalizado * row.respuestas_validas;
    total.responses += row.respuestas_validas;
    totals.set(row.docente_id, total);
  }
  return new Map([...totals].map(([docenteId, total]) => [docenteId, total.score / total.responses]));
}

export function aggregateNativeScoresByTeacherAndSubject(
  rows: NativeStudentEvaluationScore[]
): Map<number, Map<number, number>> {
  const totals = new Map<string, { docenteId: number; asignaturaId: number; score: number; responses: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.score_normalizado) || row.respuestas_validas <= 0) continue;
    const key = `${row.docente_id}:${row.asignatura_id}`;
    const total = totals.get(key) || { docenteId: row.docente_id, asignaturaId: row.asignatura_id, score: 0, responses: 0 };
    total.score += row.score_normalizado * row.respuestas_validas;
    total.responses += row.respuestas_validas;
    totals.set(key, total);
  }
  const result = new Map<number, Map<number, number>>();
  for (const total of totals.values()) {
    if (!result.has(total.docenteId)) result.set(total.docenteId, new Map());
    result.get(total.docenteId)!.set(total.asignaturaId, total.score / total.responses);
  }
  return result;
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
  const instruments: Array<number | undefined> = [ee, coord, plan, obs, autoScore];
  const expectedInstruments: number[] = [
    profile.weights.ee,
    profile.weights.coord,
    profile.weights.plan,
    profile.weights.obs,
    profile.weights.auto,
  ];
  const count = expectedInstruments
    .map((weight, idx) => weight > 0 && instruments[idx] != null)
    .filter(Boolean)
    .length;

  let final = 0;
  const weights: number[] = [profile.weights.ee, profile.weights.coord, profile.weights.plan, profile.weights.obs, profile.weights.auto];
  for (let i = 0; i < 5; i++) {
    const instrument = instruments[i];
    const weight = weights[i];
    if (instrument != null && weight > 0) final += instrument * weight;
  }
  final = Math.round(final);

  const category = scores.invalidPurposes?.length
    ? 'Parcial con instrumento inválido'
    : getCategory(final, count, profile.expectedInstrumentCount);

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
  return instrumentCount > 0 ? 'Parcial' : 'No iniciado';
}

export async function fetchCuatrimestreScores(
  cl: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number
): Promise<InstrumentScores> {
  const [eeData, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }, versionedResult] =
    await Promise.all([
      fetchNativeStudentEvaluationScores(cl, cuatrimestreId),
      cl.from('evaluacion_coordinacion').select('score_normalizado').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }).limit(1),
      cl.from('planeaciones').select('puntaje_promedio').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).eq('estado', 'Aprobado'),
      cl.from('observaciones').select(OBSERVATION_SELECT).eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('autodiagnosticos').select('puntaje_total').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }).limit(1),
      cl.rpc('versioned_instrument_score_rows', { p_cuatrimestre_id: cuatrimestreId }),
    ]);

  const versionedRows = ((versionedResult.data || []) as Array<{ docente_id: number; purpose: 'coordination' | 'planning' | 'observation'; validity_status: string; normalized_score: number | null; submitted_at: string }>)
    .filter((row) => Number(row.docente_id) === docenteId)
    .sort((left, right) => String(right.submitted_at).localeCompare(String(left.submitted_at)));
  const latestVersioned = new Map<'coordination' | 'planning' | 'observation', typeof versionedRows[number]>();
  for (const row of versionedRows) if (!latestVersioned.has(row.purpose)) latestVersioned.set(row.purpose, row);

  const ee = aggregateNativeScoresByTeacher(eeData).get(docenteId);
  const coordValue = (coordData as any[])?.[0]?.score_normalizado;
  const coordCapture = latestVersioned.get('coordination');
  const coord = coordCapture?.validity_status === 'valid'
    ? Number(coordCapture.normalized_score)
    : coordCapture ? undefined : coordValue != null ? Number(coordValue) : undefined;
  const planRows = (planData as any[]) || [];
  const legacyPlan = planRows.length
    ? planRows.reduce((sum: number, row: any) => sum + Number(row.puntaje_promedio ?? 0), 0) / planRows.length
    : undefined;
  const planCapture = latestVersioned.get('planning');
  const plan = planCapture?.validity_status === 'valid' ? Number(planCapture.normalized_score) : planCapture ? undefined : legacyPlan;
  let obs: number | undefined;
  for (const o of (obsData as any[]) || []) {
    obs = calcObservationScore(o);
  }
  const autoValue = (diagData as any[])?.[0]?.puntaje_total;
  const auto = autoValue != null ? (Number(autoValue) / 120) * 100 : undefined;

  const observationCapture = latestVersioned.get('observation');
  if (observationCapture?.validity_status === 'valid') obs = Number(observationCapture.normalized_score);
  if (observationCapture?.validity_status === 'invalid_excessive_na') obs = undefined;
  const invalidPurposes = [...latestVersioned.values()]
    .filter((row) => row.validity_status === 'invalid_excessive_na')
    .map((row) => row.purpose);
  return { ee, coord, plan, obs, auto, invalidPurposes };
}

export async function fetchBatchScoresPorDocente(
  cl: SupabaseClient,
  docenteIds: number[],
  cuatrimestreId: number
): Promise<Map<number, InstrumentScores>> {
  if (!docenteIds.length) return new Map();

  const [eeData, { data: coordData }, { data: planData }, { data: obsData }, { data: diagData }, versionedResult] =
    await Promise.all([
      fetchNativeStudentEvaluationScores(cl, cuatrimestreId),
      cl.from('evaluacion_coordinacion').select('docente_id,score_normalizado').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }),
      cl.from('planeaciones').select('docente_id,puntaje_promedio').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).eq('estado', 'Aprobado'),
      cl.from('observaciones').select(`docente_id,${OBSERVATION_SELECT}`).in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId),
      cl.from('autodiagnosticos').select('docente_id,puntaje_total').in('docente_id', docenteIds).eq('cuatrimestre_id', cuatrimestreId).order('id', { ascending: false }),
      cl.rpc('versioned_instrument_score_rows', { p_cuatrimestre_id: cuatrimestreId }),
    ]);

  const eeMap = aggregateNativeScoresByTeacher(eeData);

  const coordMap = new Map<number, number>();
  for (const c of (coordData as any[]) || []) {
    if (!coordMap.has(c.docente_id) && c.score_normalizado != null) coordMap.set(c.docente_id, Number(c.score_normalizado));
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
    if (!obsMap.has(o.docente_id)) obsMap.set(o.docente_id, score);
  }

  const diagMap = new Map<number, number>();
  for (const d of (diagData as any[]) || []) {
    if (!diagMap.has(d.docente_id) && d.puntaje_total != null) diagMap.set(d.docente_id, (Number(d.puntaje_total) / 120) * 100);
  }

  const versionedByTeacher = new Map<number, Map<string, any>>();
  for (const row of ((versionedResult.data || []) as any[]).sort((left, right) => String(right.submitted_at).localeCompare(String(left.submitted_at)))) {
    if (!docenteIds.includes(Number(row.docente_id))) continue;
    const byPurpose = versionedByTeacher.get(Number(row.docente_id)) || new Map<string, any>();
    if (!byPurpose.has(row.purpose)) byPurpose.set(row.purpose, row);
    versionedByTeacher.set(Number(row.docente_id), byPurpose);
  }
  const result = new Map<number, InstrumentScores>();
  for (const id of docenteIds) {
    const planAcc = planMap.get(id);
    const plan = planAcc ? planAcc.sum / planAcc.count : undefined;
    const versioned = versionedByTeacher.get(id);
    const validScore = (purpose: string, fallback: number | undefined) => {
      const capture = versioned?.get(purpose);
      return capture ? capture.validity_status === 'valid' ? Number(capture.normalized_score) : undefined : fallback;
    };
    result.set(id, {
      ee: eeMap.get(id),
      coord: validScore('coordination', coordMap.get(id)),
      plan: validScore('planning', plan),
      obs: validScore('observation', obsMap.get(id)),
      auto: diagMap.get(id),
      invalidPurposes: [...(versioned?.values() || [])].filter((capture) => capture.validity_status === 'invalid_excessive_na').map((capture) => capture.purpose),
    });
  }
  return result;
}
