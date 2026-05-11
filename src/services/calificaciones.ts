/**
 * Servicio de Calificaciones Finales
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { CalificacionFinal } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

export async function obtenerCalificacionesPorCuatrimestre(cuatrimestreId: number): Promise<CalificacionFinal[]> {
  const { data, error } = await cliente().from('calificacion_final_docente').select('*').eq('cuatrimestre_id', cuatrimestreId);
  if (error) throw new Error('Error al obtener calificaciones');
  return data as CalificacionFinal[];
}

export async function obtenerCalificacionDocente(docenteId: number, cuatrimestreId: number): Promise<CalificacionFinal | null> {
  const { data } = await cliente().from('calificacion_final_docente').select('*').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return data as CalificacionFinal | null;
}

export async function calcularCalificacionFinal(docenteId: number, cuatrimestreId: number): Promise<void> {
  const { error } = await cliente().rpc('calcular_calificacion_final', { p_docente_id: docenteId, p_cuatrimestre_id: cuatrimestreId });
  if (error) throw new Error('Error al calcular calificación final');
}
