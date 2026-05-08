/**
 * Servicio de Agregación — Capa de Datos SED-360
 *
 * Propósito: Abstraer las consultas a la vista materializada
 * `resultados_agregados` y funciones de cálculo para el dashboard
 * administrativo 360°.
 *
 * Dependencias:
 *   - MV Supabase: resultados_agregados
 *   - Tabla Supabase: evaluaciones
 *   - Cliente: src/lib/supabaseClient.ts
 *   - Utilidad: src/utils/normalizacion.ts (calcularPuntajeGlobal)
 *   - Constantes: src/types/supabase.ts (PONDERACION_360)
 */

import type { ResultadoAgregado } from '../types/supabase';
import { PONDERACION_360 } from '../types/supabase';
import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import { calcularPuntajeGlobal } from '../utils/normalizacion';

/**
 * Obtiene los resultados agregados de todas las cargas en un periodo.
 *
 * @param idPeriodo - Identificador del periodo (ej: "2025-1")
 * @returns Lista de resultados agregados
 * @throws Error si la consulta falla
 */
export async function obtenerResultadosPorPeriodo(
  idPeriodo: string
): Promise<ResultadoAgregado[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('resultados_agregados')
    .select('*')
    .eq('id_periodo', idPeriodo);

  if (error) {
    console.error(
      '[Servicio Agregación] Error al consultar resultados por periodo:',
      error
    );
    throw new Error(
      'Error al obtener los resultados del periodo. Intente nuevamente.'
    );
  }

  return data as ResultadoAgregado[];
}

/**
 * Calcula el puntaje global 360° a partir de un ResultadoAgregado.
 *
 * Extrae los promedios de los 5 actores y aplica la ponderación
 * definida en PONDERACION_360.
 *
 * @param resultado - Resultado agregado de una carga académica
 * @returns Puntaje global 360° (0-100)
 */
export function calcularPuntajeGlobal360(
  resultado: ResultadoAgregado
): number {
  const promedios: Record<string, number> = {};

  if (resultado.promedio_alumno !== null) {
    promedios.ALUMNO = resultado.promedio_alumno;
  }
  if (resultado.promedio_coordinador !== null) {
    promedios.COORDINADOR = resultado.promedio_coordinador;
  }
  if (resultado.promedio_tecnico !== null) {
    promedios.TECNICO = resultado.promedio_tecnico;
  }
  if (resultado.promedio_calidad !== null) {
    promedios.CALIDAD = resultado.promedio_calidad;
  }
  if (resultado.promedio_auto !== null) {
    promedios.AUTO = resultado.promedio_auto;
  }

  return calcularPuntajeGlobal(promedios, PONDERACION_360);
}

/**
 * Obtiene el progreso de evaluación para un periodo.
 *
 * Calcula cuántas cargas académicas tienen al menos una evaluación
 * versus el total de cargas del periodo.
 *
 * @param idPeriodo - Identificador del periodo
 * @returns Objeto con totalCargas, cargasEvaluadas y porcentaje
 */
export async function obtenerProgresoEvaluacion(
  idPeriodo: string
): Promise<{ totalCargas: number; cargasEvaluadas: number; porcentaje: number }> {
  const cliente = obtenerClienteSuperbase();

  // Obtener IDs de todas las cargas del periodo
  const { data: cargasIds, error: errorCargas } = await cliente
    .from('cargas_academicas')
    .select('id_carga')
    .eq('id_periodo', idPeriodo);

  if (errorCargas) {
    console.error(
      '[Servicio Agregación] Error al consultar cargas:',
      errorCargas
    );
    throw new Error(
      'Error al obtener el progreso de evaluación. Intente nuevamente.'
    );
  }

  const total = cargasIds?.length ?? 0;

  if (total === 0) {
    return { totalCargas: 0, cargasEvaluadas: 0, porcentaje: 0 };
  }

  // Consultar cuántas cargas tienen al menos una evaluación válida
  const { data: evaluadas, error: errorEv } = await cliente
    .from('evaluaciones')
    .select('id_carga')
    .in('id_carga', cargasIds!.map((c) => c.id_carga))
    .or('marcado_inapropiado.is.null,marcado_inapropiado.eq.false');

  if (errorEv) {
    console.error(
      '[Servicio Agregación] Error al contar evaluaciones:',
      errorEv
    );
    throw new Error(
      'Error al obtener el progreso de evaluación. Intente nuevamente.'
    );
  }

  const cargasEvaluadas = new Set(evaluadas?.map((e) => e.id_carga) ?? []).size;
  const porcentaje = total > 0 ? Math.round((cargasEvaluadas / total) * 100) : 0;

  return { totalCargas: total, cargasEvaluadas, porcentaje };
}

/**
 * Obtiene los comentarios anónimos de una carga académica.
 *
 * NUNCA expone metadatos del evaluador. Solo retorna el texto del
 * comentario, sin id_evaluador, tipo_actor ni fecha_creacion.
 * Los comentarios se devuelven en orden aleatorio para reforzar
 * el anonimato (orden no determinístico).
 *
 * @param idCarga - ID de la carga académica
 * @returns Lista de comentarios anónimos en orden aleatorio
 */
export async function obtenerComentariosAnonimos(
  idCarga: number
): Promise<string[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('evaluaciones')
    .select('comentario')
    .eq('id_carga', idCarga)
    .not('comentario', 'is', null)
    .or('marcado_inapropiado.is.null,marcado_inapropiado.eq.false');

  if (error) {
    console.error(
      '[Servicio Agregación] Error al obtener comentarios:',
      error
    );
    throw new Error(
      'Error al obtener los comentarios de la evaluación. Intente nuevamente.'
    );
  }

  // Extraer solo el texto y filtrar vacíos
  const comentarios = data
    .map((e) => e.comentario)
    .filter((c): c is string => c !== null && c.trim().length > 0);

  // Mezclar aleatoriamente (shuffle Fisher-Yates)
  // Supabase JS no soporta ORDER BY RANDOM() en el cliente
  for (let i = comentarios.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [comentarios[i], comentarios[j]] = [comentarios[j], comentarios[i]];
  }

  return comentarios;
}

/**
 * Refresca la vista materializada de resultados agregados.
 * Solo puede ser ejecutada por usuarios con rol admin (RLS).
 */
export async function refrescarResultadosAgregados(): Promise<void> {
  const cliente = obtenerClienteSuperbase();

  const { error } = await cliente.rpc('refrescar_resultados');

  if (error) {
    console.error(
      '[Servicio Agregación] Error al refrescar MV:',
      error
    );
    throw new Error(
      'Error al actualizar los resultados. Intente nuevamente.'
    );
  }
}
