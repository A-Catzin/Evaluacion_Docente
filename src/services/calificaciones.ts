/**
 * Servicio de Calificaciones Finales
 */
import { db } from '../lib/db';
import type { CalificacionFinal } from '../types/supabase';

export async function obtenerCalificacionesPorCuatrimestre(cuatrimestreId: number): Promise<CalificacionFinal[]> {
  const { data, error } = await db().from('calificacion_final_docente').select('*').eq('cuatrimestre_id', cuatrimestreId);
  if (error) throw new Error('Error al obtener calificaciones');
  return data as CalificacionFinal[];
}

export async function obtenerCalificacionDocente(docenteId: number, cuatrimestreId: number): Promise<CalificacionFinal | null> {
  const { data } = await db().from('calificacion_final_docente').select('*').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return data as CalificacionFinal | null;
}

export async function calcularCalificacionFinal(docenteId: number, cuatrimestreId: number): Promise<void> {
  const { error } = await db().rpc('calcular_calificacion_final', { p_docente_id: docenteId, p_cuatrimestre_id: cuatrimestreId });
  if (error) throw new Error('Error al calcular calificación final');
}
