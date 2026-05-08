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
 */

import type { Periodo } from '../types/supabase';
import { obtenerClienteSuperbase } from '../lib/supabaseClient';

/**
 * Obtiene el periodo activo actual.
 *
 * @returns El periodo activo, o null si no hay ninguno
 * @throws Error si la consulta falla
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
    throw new Error(
      'Error al obtener el periodo activo. Intente nuevamente.'
    );
  }

  return data as Periodo | null;
}

/**
 * Obtiene todos los periodos académicos ordenados descendentemente.
 *
 * @returns Lista de periodos
 * @throws Error si la consulta falla
 */
export async function obtenerPeriodos(): Promise<Periodo[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('periodos')
    .select('*')
    .order('id_periodo', { ascending: false });

  if (error) {
    console.error('[Servicio Periodos] Error al consultar periodos:', error);
    throw new Error(
      'Error al obtener los periodos académicos. Intente nuevamente.'
    );
  }

  return data as Periodo[];
}
