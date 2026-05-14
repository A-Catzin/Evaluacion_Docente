/**
 * Servicio de Periodos — Capa de Datos SED-360
 *
 * Propósito: Abstraer todas las interacciones con la tabla `periodos`
 * de Supabase. Aplica el patrón Service Layer para desacoplar la lógica
 * de negocio de los componentes UI.
 *
 * Dependencias:
 *   - Tabla Supabase: periodos
 *   - Cliente: src/lib/supabaseClient.ts
 *
 * Restricciones:
 *   - Solo un periodo puede estar activo a la vez (garantizado por índice único parcial)
 *   - Solo usuarios con rol 'admin' pueden crear/modificar periodos (RLS)
 */

import type { Periodo } from '../types/supabase';
import { obtenerClienteSuperbase } from '../lib/supabaseClient';

/**
 * Obtiene el periodo activo actual.
 */
export async function obtenerPeriodoActivo(): Promise<Periodo | null> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .maybeSingle();

  if (error) {
    console.error('[Servicio Periodos] Error al consultar periodo activo:', error);
    throw new Error('Error al obtener el periodo activo. Intente nuevamente.');
  }

  return data as Periodo | null;
}

/**
 * Obtiene todos los periodos académicos ordenados descendentemente.
 */
export async function obtenerPeriodos(): Promise<Periodo[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('periodos')
    .select('*')
    .order('id_periodo', { ascending: false });

  if (error) {
    console.error('[Servicio Periodos] Error al consultar periodos:', error);
    throw new Error('Error al obtener los periodos académicos. Intente nuevamente.');
  }

  return data as Periodo[];
}

/**
 * Crea un nuevo periodo académico.
 * El nuevo periodo se crea como inactivo por defecto.
 */
export async function crearPeriodo(
  id_periodo: string,
  nombre: string,
  fecha_inicio: string,
  fecha_fin: string
): Promise<Periodo> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('periodos')
    .insert({ id_periodo, nombre, fecha_inicio, fecha_fin, activo: false })
    .select()
    .single();

  if (error) {
    console.error('[Servicio Periodos] Error al crear periodo:', error);
    if (error.code === '23505') {
      throw new Error('Ya existe un periodo con ese identificador.');
    }
    throw new Error('Error al crear el periodo. Intente nuevamente.');
  }

  return data as Periodo;
}

/**
 * Activa un periodo (y desactiva cualquier otro que estuviera activo).
 * Solo puede haber un periodo activo a la vez.
 */
export async function activarPeriodo(id_periodo: string): Promise<void> {
  const cliente = obtenerClienteSuperbase();

  // 1. Desactivar todos los periodos
  const { error: errorDesactivar } = await cliente
    .from('periodos')
    .update({ activo: false })
    .neq('id_periodo', '');
    // .neq con valor inofensivo para desactivar todo

  if (errorDesactivar) {
    console.error('[Servicio Periodos] Error al desactivar periodos:', errorDesactivar);
    throw new Error('Error al activar el periodo. Intente nuevamente.');
  }

  // 2. Activar el periodo específico
  const { error: errorActivar } = await cliente
    .from('periodos')
    .update({ activo: true })
    .eq('id_periodo', id_periodo);

  if (errorActivar) {
    console.error('[Servicio Periodos] Error al activar periodo:', errorActivar);
    throw new Error('Error al activar el periodo. Intente nuevamente.');
  }
}
