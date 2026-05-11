/**
 * Servicio de Catálogos — Cuatrimestres, Licenciaturas, Asignaturas
 */
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Cuatrimestre, Licenciatura, Asignatura } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

// ─── Cuatrimestres ──────────────────────────────────────────────

export async function obtenerCuatrimestres(): Promise<Cuatrimestre[]> {
  const { data, error } = await cliente().from('cuatrimestres').select('*').order('id', { ascending: false });
  if (error) throw new Error('Error al obtener cuatrimestres');
  return data as Cuatrimestre[];
}

export async function obtenerCuatrimestreActivo(): Promise<Cuatrimestre | null> {
  const { data } = await cliente().from('cuatrimestres').select('*').eq('activo', true).maybeSingle();
  return data as Cuatrimestre | null;
}

export async function crearCuatrimestre(c: Partial<Cuatrimestre>): Promise<Cuatrimestre> {
  const { data, error } = await cliente().from('cuatrimestres').insert(c).select().single();
  if (error) throw new Error('Error al crear cuatrimestre');
  return data as Cuatrimestre;
}

export async function cerrarCuatrimestre(id: number): Promise<void> {
  const { error } = await cliente().from('cuatrimestres').update({ cerrado: true, activo: false }).eq('id', id);
  if (error) throw new Error('Error al cerrar cuatrimestre');
}

// ─── Licenciaturas ─────────────────────────────────────────────

export async function obtenerLicenciaturas(): Promise<Licenciatura[]> {
  const { data, error } = await cliente().from('licenciaturas').select('*').order('nombre');
  if (error) throw new Error('Error al obtener licenciaturas');
  return data as Licenciatura[];
}

// ─── Asignaturas ───────────────────────────────────────────────

export async function obtenerAsignaturas(licenciaturaId?: number): Promise<Asignatura[]> {
  let query = cliente().from('asignaturas').select('*').order('nombre');
  if (licenciaturaId) query = query.eq('licenciatura_id', licenciaturaId);
  const { data, error } = await query;
  if (error) throw new Error('Error al obtener asignaturas');
  return data as Asignatura[];
}
