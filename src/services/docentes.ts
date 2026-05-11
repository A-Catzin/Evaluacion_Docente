/**
 * Servicio de Docentes y Grupos
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Docente, Grupo } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

// ─── Docentes ──────────────────────────────────────────────────

export async function obtenerDocentes(): Promise<Docente[]> {
  const { data, error } = await cliente().from('docentes').select('*').order('apellidos');
  if (error) throw new Error('Error al obtener docentes');
  return data as Docente[];
}

export async function obtenerDocente(id: number): Promise<Docente | null> {
  const { data } = await cliente().from('docentes').select('*').eq('id', id).maybeSingle();
  return data as Docente | null;
}

export async function crearDocente(d: Partial<Docente>): Promise<Docente> {
  const { data, error } = await cliente().from('docentes').insert(d).select().single();
  if (error) throw new Error('Error al crear docente');
  return data as Docente;
}

export async function actualizarDocente(id: number, d: Partial<Docente>): Promise<void> {
  const { error } = await cliente().from('docentes').update(d).eq('id', id);
  if (error) throw new Error('Error al actualizar docente');
}

// ─── Grupos ────────────────────────────────────────────────────

export async function obtenerGrupos(cuatrimestreId?: number): Promise<Grupo[]> {
  let query = cliente().from('grupos').select('*').order('clave');
  if (cuatrimestreId) query = query.eq('cuatrimestre_id', cuatrimestreId);
  const { data, error } = await query;
  if (error) throw new Error('Error al obtener grupos');
  return data as Grupo[];
}

export async function obtenerGruposPorDocente(docenteId: number, cuatrimestreId?: number): Promise<Grupo[]> {
  let query = cliente().from('grupos').select('*').eq('docente_id', docenteId);
  if (cuatrimestreId) query = query.eq('cuatrimestre_id', cuatrimestreId);
  const { data, error } = await query;
  if (error) throw new Error('Error al obtener grupos del docente');
  return data as Grupo[];
}
