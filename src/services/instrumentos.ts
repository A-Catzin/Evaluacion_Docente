/**
 * Servicio de Instrumentos — 5 instrumentos de evaluación SED-360 v2
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type {
  EncuestaEstudiantilRespuesta,
  EvaluacionCoordinacion,
  EvaluacionPlaneacion,
  ObservacionClase,
  AutoevaluacionDocente,
} from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

// ─── EE: Encuesta Estudiantil ──────────────────────────────────

export async function enviarEncuestaEstudiantil(
  data: Partial<EncuestaEstudiantilRespuesta>
): Promise<EncuestaEstudiantilRespuesta> {
  const { data: result, error } = await cliente().from('encuesta_estudiantil_respuestas').insert(data).select().single();
  if (error) throw new Error('Error al enviar encuesta');
  return result as EncuestaEstudiantilRespuesta;
}

export async function obtenerEncuestasPorDocente(docenteId: number): Promise<EncuestaEstudiantilRespuesta[]> {
  const { data, error } = await cliente().from('encuesta_estudiantil_respuestas').select('*').eq('docente_id', docenteId);
  if (error) throw new Error('Error al obtener encuestas');
  return data as EncuestaEstudiantilRespuesta[];
}

export async function verificarEncuestaEnviada(estudianteId: number, grupoId: number, cuatrimestreId: number): Promise<boolean> {
  const { data } = await cliente().from('encuesta_control_envio').select('id')
    .eq('estudiante_id', estudianteId).eq('grupo_id', grupoId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return !!data;
}

export async function registrarControlEnvio(estudianteId: number, grupoId: number, cuatrimestreId: number): Promise<void> {
  const { error } = await cliente().from('encuesta_control_envio').insert({ estudiante_id: estudianteId, grupo_id: grupoId, cuatrimestre_id: cuatrimestreId });
  if (error) throw new Error('Error al registrar control de envío');
}

// ─── CA: Coordinación Académica ────────────────────────────────

export async function enviarEvaluacionCoordinacion(data: Partial<EvaluacionCoordinacion>): Promise<EvaluacionCoordinacion> {
  const { data: result, error } = await cliente().from('evaluacion_coordinacion').insert(data).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una evaluación de coordinación para este docente en este cuatrimestre');
    throw new Error('Error al enviar evaluación de coordinación');
  }
  return result as EvaluacionCoordinacion;
}

export async function obtenerEvalCoordinacionPorDocente(docenteId: number, cuatrimestreId?: number) {
  let query = cliente().from('evaluacion_coordinacion').select('*').eq('docente_id', docenteId);
  if (cuatrimestreId) query = query.eq('cuatrimestre_id', cuatrimestreId);
  const { data, error } = await query;
  if (error) throw new Error('Error al obtener evaluaciones de coordinación');
  return data as EvaluacionCoordinacion[];
}

// ─── PD: Planeación Docente ────────────────────────────────────

export async function enviarEvaluacionPlaneacion(data: Partial<EvaluacionPlaneacion>): Promise<EvaluacionPlaneacion> {
  const { data: result, error } = await cliente().from('evaluacion_planeacion').insert(data).select().single();
  if (error) throw new Error('Error al enviar evaluación de planeación');
  return result as EvaluacionPlaneacion;
}

// ─── OC: Observación de Clase ──────────────────────────────────

export async function enviarObservacionClase(data: Partial<ObservacionClase>): Promise<ObservacionClase> {
  const { data: result, error } = await cliente().from('observacion_clase').insert(data).select().single();
  if (error) throw new Error('Error al enviar observación de clase');
  return result as ObservacionClase;
}

// ─── AE: Auto-evaluación ──────────────────────────────────────

export async function enviarAutoevaluacion(data: Partial<AutoevaluacionDocente>): Promise<AutoevaluacionDocente> {
  const { data: result, error } = await cliente().from('autoevaluacion_docente').insert(data).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya enviaste tu auto-evaluación para este cuatrimestre');
    throw new Error('Error al enviar auto-evaluación');
  }
  return result as AutoevaluacionDocente;
}

export async function obtenerAutoevaluacion(docenteId: number, cuatrimestreId: number): Promise<AutoevaluacionDocente | null> {
  const { data } = await cliente().from('autoevaluacion_docente').select('*').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return data as AutoevaluacionDocente | null;
}
