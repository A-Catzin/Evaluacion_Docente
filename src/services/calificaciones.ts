/**
 * Servicio de Calificaciones Finales
 */
import { db } from '../lib/db';
import type { CalificacionFinal } from '../types/supabase';
import { calcFinalScore, fetchBatchScoresPorDocente, fetchCuatrimestreScores } from './scoring';

export async function obtenerCalificacionesPorCuatrimestre(cuatrimestreId: number): Promise<CalificacionFinal[]> {
  const client = db();
  const { data: docentes, error } = await client.from('docentes').select('id,modalidad').eq('activo', true);
  if (error) throw new Error('Error al obtener docentes');
  const scores = await fetchBatchScoresPorDocente(client, (docentes || []).map((docente) => docente.id), cuatrimestreId);
  return (docentes || []).map((docente) => toCalificacion(docente.id, cuatrimestreId, scores.get(docente.id), docente.modalidad));
}

export async function obtenerCalificacionDocente(docenteId: number, cuatrimestreId: number): Promise<CalificacionFinal | null> {
  const client = db();
  const { data: docente } = await client.from('docentes').select('modalidad').eq('id', docenteId).maybeSingle();
  if (!docente) return null;
  return toCalificacion(docenteId, cuatrimestreId, await fetchCuatrimestreScores(client, docenteId, cuatrimestreId), docente.modalidad);
}

export async function calcularCalificacionFinal(docenteId: number, cuatrimestreId: number): Promise<void> {
  await obtenerCalificacionDocente(docenteId, cuatrimestreId);
}

function toCalificacion(docenteId: number, cuatrimestreId: number, scores: Awaited<ReturnType<typeof fetchCuatrimestreScores>> | undefined, modalidad?: string | null): CalificacionFinal {
  const safeScores = scores || {};
  const final = calcFinalScore(safeScores, modalidad);
  return {
    id: 0,
    docente_id: docenteId,
    cuatrimestre_id: cuatrimestreId,
    score_encuesta_estudiantil: safeScores.ee ?? null,
    score_coordinacion: safeScores.coord ?? null,
    score_planeacion: safeScores.plan ?? null,
    score_observacion: safeScores.obs ?? null,
    score_autoevaluacion: safeScores.auto ?? null,
    calificacion_final: final.final,
    categoria_final: final.category,
    num_instrumentos_completados: final.instrumentCount,
  };
}
