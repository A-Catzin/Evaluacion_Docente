import type { Evaluacion, TipoActor } from '../types/supabase';
import { obtenerClienteSuperbase } from '../lib/supabaseClient';

/**
 * Servicio de Evaluaciones — Capa de Datos SED-360
 *
 * Propósito: Abstraer todas las interacciones con la tabla `evaluaciones`
 * de Supabase. Aplica el patrón Service Layer para desacoplar la lógica
 * de negocio de los componentes UI.
 *
 * Dependencias:
 *   - Tabla Supabase: evaluaciones
 *   - Cliente: src/lib/supabaseClient.ts
 *
 * Restricciones de negocio:
 *   - Voto único: El CONSTRAINT unique_vote en SQL previene doble envío
 *   - Moderación: El campo marcado_inapropiado es responsabilidad de
 *     un filtro externo (src/features/moderacion/)
 *   - Anonimato: Este servicio NUNCA expone el id_evaluador en respuestas
 *     que lleguen al frontend del docente
 */

/**
 * Envía una evaluación a la base de datos.
 *
 * @param evaluacion - Datos de la evaluación a insertar (sin id ni fecha)
 * @returns La evaluación insertada con id y fecha generados
 * @throws Error si el CONSTRAINT unique_vote rechaza la inserción
 *
 * @nota `marcado_inapropiado` se agregó en PR 3 (Fase 2) para soportar
 *       moderación de comentarios vía blacklist. Default: false.
 */
export async function enviarEvaluacion(evaluacion: {
  id_evaluador: string;
  id_carga: number;
  tipo_actor: TipoActor;
  puntaje_promedio: number;
  comentario?: string | null;
  marcado_inapropiado?: boolean;
}): Promise<Evaluacion> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('evaluaciones')
    .insert({
      id_evaluador: evaluacion.id_evaluador,
      id_carga: evaluacion.id_carga,
      tipo_actor: evaluacion.tipo_actor,
      puntaje_promedio: evaluacion.puntaje_promedio,
      comentario: evaluacion.comentario ?? null,
      marcado_inapropiado: evaluacion.marcado_inapropiado ?? false,
    })
    .select()
    .single();

  if (error) {
    // Traducir errores de constraint a mensajes amigables
    if (error.code === '23505') {
      throw new Error('Esta carga académica ya fue evaluada.');
    }
    console.error('[Servicio Evaluaciones] Error al insertar:', error);
    throw new Error('Error al guardar la evaluación. Intente nuevamente.');
  }

  return data as Evaluacion;
}

/**
 * Obtiene las evaluaciones realizadas por un usuario específico.
 * Útil para verificar el estado de "Mis Evaluaciones".
 *
 * @param idEvaluador - UUID del usuario evaluador
 * @returns Lista de evaluaciones del usuario
 */
export async function obtenerEvaluacionesPorUsuario(
  idEvaluador: string
): Promise<Evaluacion[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('evaluaciones')
    .select('*')
    .eq('id_evaluador', idEvaluador)
    .order('fecha_creacion', { ascending: false });

  if (error) {
    console.error('[Servicio Evaluaciones] Error al consultar:', error);
    throw new Error('Error al obtener las evaluaciones.');
  }

  return data as Evaluacion[];
}

/**
 * Obtiene los resultados agregados por carga académica (anónimos).
 * Para uso del dashboard de docentes y coordinadores.
 * La capa de UI es responsable de NO exponer el id_evaluador.
 *
 * @param idCarga - ID de la carga académica
 * @returns Evaluaciones asociadas a la carga (sin datos de identidad en UI)
 */
export async function obtenerEvaluacionesPorCarga(
  idCarga: number
): Promise<Evaluacion[]> {
  const cliente = obtenerClienteSuperbase();

  const { data, error } = await cliente
    .from('evaluaciones')
    .select('*')
    .eq('id_carga', idCarga);

  if (error) {
    console.error('[Servicio Evaluaciones] Error al consultar carga:', error);
    throw new Error('Error al obtener los resultados de la carga académica.');
  }

  return data as Evaluacion[];
}
