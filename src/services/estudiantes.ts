/**
 * Servicio de Estudiantes e Inscripciones
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Estudiante, Inscripcion } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

// ─── Estudiantes ───────────────────────────────────────────────

export async function obtenerEstudiantes(): Promise<Estudiante[]> {
  const { data, error } = await cliente().from('estudiantes').select('*').order('apellidos');
  if (error) throw new Error('Error al obtener estudiantes');
  return data as Estudiante[];
}

export async function obtenerEstudiantePorUsuarioId(usuarioId: string): Promise<Estudiante | null> {
  const { data: usuario } = await cliente().from('usuarios').select('entidad_id').eq('id', usuarioId).maybeSingle();
  if (!usuario?.entidad_id) return null;
  const { data } = await cliente().from('estudiantes').select('*').eq('id', usuario.entidad_id).maybeSingle();
  return data as Estudiante | null;
}

// ─── Inscripciones ─────────────────────────────────────────────

export async function obtenerInscripciones(estudianteId: number, cuatrimestreId?: number): Promise<Inscripcion[]> {
  let query = cliente().from('inscripciones').select('*').eq('estudiante_id', estudianteId);
  if (cuatrimestreId) query = query.eq('cuatrimestre_id', cuatrimestreId);
  const { data, error } = await query;
  if (error) throw new Error('Error al obtener inscripciones');
  return data as Inscripcion[];
}

export async function obtenerGruposDelEstudiante(estudianteId: number, cuatrimestreId: number) {
  const { data, error } = await cliente()
    .from('inscripciones')
    .select('grupo_id, grupos!inner(id, clave, asignatura_id, docente_id, cuatrimestre_id)')
    .eq('estudiante_id', estudianteId)
    .eq('cuatrimestre_id', cuatrimestreId);
  if (error) throw new Error('Error al obtener grupos del estudiante');
  return data;
}
