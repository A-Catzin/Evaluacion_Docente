import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Planeacion } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

export async function obtenerPlaneacionesPorDocente(docenteId: number): Promise<Planeacion[]> {
  const { data, error } = await cliente().from('planeaciones').select('*').eq('docente_id', docenteId).order('fecha_subida', { ascending: false });
  if (error) throw new Error('Error al obtener planeaciones');
  return data as Planeacion[];
}

export async function obtenerPlaneacionesPendientes(): Promise<Planeacion[]> {
  const { data, error } = await cliente().from('planeaciones').select('*').eq('estado', 'Pendiente').order('fecha_subida');
  if (error) throw new Error('Error al obtener planeaciones pendientes');
  return data as Planeacion[];
}

export async function obtenerPlaneacion(id: number): Promise<Planeacion | null> {
  const { data } = await cliente().from('planeaciones').select('*').eq('id', id).maybeSingle();
  return data as Planeacion | null;
}

export async function subirPlaneacion(data: Partial<Planeacion>): Promise<Planeacion> {
  const { data: result, error } = await cliente().from('planeaciones').insert(data).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya subiste una planeación para esta asignatura en este cuatrimestre');
    throw new Error('Error al guardar planeación');
  }
  return result as Planeacion;
}

export async function evaluarPlaneacion(id: number, data: {
  criterio_alineacion: number; criterio_secuencia: number;
  criterio_recursos: number; criterio_evaluacion: number;
  estado: string; comentario_retroalimentacion?: string; comentario_interno?: string;
}): Promise<void> {
  const puntaje = Math.round(((data.criterio_alineacion + data.criterio_secuencia + data.criterio_recursos + data.criterio_evaluacion) / 4 / 5) * 100 * 100) / 100;
  const { error } = await cliente().from('planeaciones').update({
    ...data, puntaje_promedio: puntaje, fecha_evaluacion: new Date().toISOString()
  }).eq('id', id);
  if (error) throw new Error('Error al evaluar planeación');
}

export function calcularPromedioPlaneacion(plan: Planeacion): number {
  const criterios = [plan.criterio_alineacion, plan.criterio_secuencia, plan.criterio_recursos, plan.criterio_evaluacion].filter(v => v) as number[];
  if (criterios.length === 0) return 0;
  return Math.round((criterios.reduce((a, b) => a + b, 0) / (criterios.length * 5)) * 100);
}
