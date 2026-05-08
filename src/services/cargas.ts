/**
 * Servicio de Cargas Académicas — Capa de Datos SED-360
 *
 * Propósito: Abstraer todas las interacciones con la tabla `cargas_academicas`
 * de Supabase. Aplica el patrón Service Layer para desacoplar la lógica
 * de negocio de los componentes UI.
 *
 * Dependencias:
 *   - Tabla Supabase: cargas_academicas
 *   - Servicio: src/services/evaluaciones.ts (reuso)
 *   - Cliente: src/lib/supabaseClient.ts
 */

import type { CargaAcademica, Evaluacion } from '../types/supabase';
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import { obtenerEvaluacionesPorUsuario } from './evaluaciones';

/**
 * Obtiene las cargas académicas de un periodo específico.
 *
 * @param periodo - Identificador del periodo (ej: "2025-1")
 * @returns Lista de cargas académicas del periodo
 * @throws Error si la consulta falla
 */
export async function obtenerCargasPorPeriodo(
  periodo: string
): Promise<CargaAcademica[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('cargas_academicas')
    .select('*')
    .eq('id_periodo', periodo);

  if (error) {
    console.error('[Servicio Cargas] Error al consultar por periodo:', error);
    throw new Error(
      'Error al obtener las cargas académicas del periodo. Intente nuevamente.'
    );
  }

  return data as CargaAcademica[];
}

/**
 * Obtiene las evaluaciones realizadas por un evaluador específico.
 * Reusa el servicio existente de evaluaciones.ts.
 *
 * @param idEvaluador - UUID del usuario evaluador
 * @returns Lista de evaluaciones del usuario
 */
export async function obtenerEvaluacionesDelUsuario(
  idEvaluador: string
): Promise<Evaluacion[]> {
  try {
    return await obtenerEvaluacionesPorUsuario(idEvaluador);
  } catch (error) {
    console.error(
      '[Servicio Cargas] Error al obtener evaluaciones del usuario:',
      error
    );
    throw new Error(
      'Error al obtener las evaluaciones del usuario. Intente nuevamente.'
    );
  }
}

/**
 * Obtiene las cargas académicas de un periodo junto con su estado de
 * evaluación para un evaluador específico.
 *
 * Cruza las cargas del periodo con las evaluaciones del usuario para
 * determinar cuáles ya fueron evaluadas (completado) y cuáles están
 * pendientes.
 *
 * @param periodo - Identificador del periodo (ej: "2025-1")
 * @param idEvaluador - UUID del usuario evaluador
 * @returns Lista de cargas con estado 'pendiente' o 'completado'
 */
export async function obtenerCargasConEstado(
  periodo: string,
  idEvaluador: string
): Promise<
  Array<CargaAcademica & { estado: 'pendiente' | 'completado' }>
> {
  const [cargas, evaluaciones] = await Promise.all([
    obtenerCargasPorPeriodo(periodo),
    obtenerEvaluacionesDelUsuario(idEvaluador),
  ]);

  const idsEvaluados = new Set(evaluaciones.map((e) => e.id_carga));

  return cargas.map((carga) => ({
    ...carga,
    estado: idsEvaluados.has(carga.id_carga) ? 'completado' : 'pendiente',
  }));
}
