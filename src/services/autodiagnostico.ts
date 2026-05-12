/**
 * Servicio de Autodiagnóstico Docente
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Autodiagnostico } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

export interface DatosAutodiagnostico {
  docente_id: number;
  cuatrimestre_id: number;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  campus: string;
  oferta_academica: string;
  turno: string;
  reactivos: number[]; // 24 valores (1-5)
  comentarios?: string;
}

export async function enviarAutodiagnostico(data: DatosAutodiagnostico): Promise<Autodiagnostico> {
  // 1. Actualizar perfil del docente
  const { error: errDoc } = await cliente().from('docentes').update({
    nombre: data.nombre,
    apellido_paterno: data.apellido_paterno,
    apellido_materno: data.apellido_materno,
    apellidos: `${data.apellido_paterno} ${data.apellido_materno}`.trim(),
    campus: data.campus,
    turno: data.turno,
    oferta_academica: data.oferta_academica,
  }).eq('id', data.docente_id);

  if (errDoc) throw new Error('Error al actualizar perfil del docente');

  // 2. Insertar autodiagnóstico
  const { data: result, error } = await cliente().from('autodiagnosticos').insert({
    docente_id: data.docente_id,
    cuatrimestre_id: data.cuatrimestre_id,
    r1: data.reactivos[0], r2: data.reactivos[1], r3: data.reactivos[2], r4: data.reactivos[3],
    r5: data.reactivos[4], r6: data.reactivos[5], r7: data.reactivos[6], r8: data.reactivos[7],
    r9: data.reactivos[8], r10: data.reactivos[9], r11: data.reactivos[10], r12: data.reactivos[11],
    r13: data.reactivos[12], r14: data.reactivos[13], r15: data.reactivos[14], r16: data.reactivos[15],
    r17: data.reactivos[16], r18: data.reactivos[17], r19: data.reactivos[18], r20: data.reactivos[19],
    r21: data.reactivos[20], r22: data.reactivos[21], r23: data.reactivos[22], r24: data.reactivos[23],
    nivel_desempeno: calcularNivel(data.reactivos),
    comentarios: data.comentarios || null,
  }).select().single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya completaste tu autodiagnóstico para este cuatrimestre');
    throw new Error('Error al guardar autodiagnóstico');
  }

  return result as Autodiagnostico;
}

export async function obtenerAutodiagnostico(docenteId: number, cuatrimestreId: number): Promise<Autodiagnostico | null> {
  const { data } = await cliente().from('autodiagnosticos').select('*')
    .eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return data as Autodiagnostico | null;
}

function calcularNivel(reactivos: number[]): string {
  const suma = reactivos.reduce((a, b) => a + b, 0);
  const promedio = (suma / 120) * 100;
  if (promedio >= 90) return 'Excelente';
  if (promedio >= 75) return 'Satisfactorio';
  if (promedio >= 60) return 'En Desarrollo';
  return 'Necesita Mejora';
}
