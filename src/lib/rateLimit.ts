/**
 * Controles de frecuencia y tamaño para endpoints sensibles de SED-360.
 *
 * Estrategia para Vercel (serverless, sin estado compartido):
 * - El rate limiting crítico se hace contra la base de datos (tabla
 *   `encuesta_control_envio`), que es la única fuente de verdad compartida
 *   entre invocaciones.
 * - No se usa estado en memoria para proteger la API pública porque en Vercel
 *   cada función puede ejecutarse en un contenedor distinto y el límite no se
 *   respetaría entre invocaciones.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Límite por defecto para el body de la evaluación estudiantil (50 KB). */
export const MAX_EVALUACION_BODY_BYTES = 50 * 1024;

/** Límite por defecto para archivos CSV de importación (25 MB). */
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;

export interface BodySizeCheck {
  ok: boolean;
  size?: number;
  error?: string;
}

/**
 * Verifica el tamaño declarado del body mediante `Content-Length`.
 *
 * Si el header no está presente devuelve `ok: true` y deja que el endpoint
 * decida si necesita leer el stream para medirlo.
 */
export function checkRequestBodySize(
  request: Request,
  maxBytes: number,
): BodySizeCheck {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > maxBytes) {
      return {
        ok: false,
        size,
        error: `El cuerpo de la solicitud no debe superar los ${maxBytes} bytes`,
      };
    }
    return { ok: true, size };
  }
  return { ok: true };
}

export interface RateLimitDbOptions {
  estudianteId: number;
  grupoId: number;
  cuatrimestreId?: number | null;
  /** Máximo de envíos en la ventana de tiempo (default: 10). */
  maxPerWindow?: number;
  /** Ventana de tiempo en minutos (default: 10). */
  windowMinutes?: number;
  /** Máximo de envíos permitidos en el mismo ciclo (default: 200). */
  maxPerCiclo?: number;
}

export interface RateLimitDbResult {
  permitido: boolean;
  razon?: string;
  enviosRecientes?: number;
}

/**
 * Verifica límites de frecuencia para envíos de encuestas estudiantiles
 * consultando `encuesta_control_envio`.
 *
 * Controles:
 * 1. No permitir dos envíos para el mismo estudiante + grupo + ciclo.
 * 2. No más de `maxPerWindow` envíos en `windowMinutes`.
 * 3. No más de `maxPerCiclo` envíos en el ciclo actual.
 *
 * Si alguna consulta a la base de datos falla, se permite continuar para no
 * bloquear envíos legítimos por errores transitorios; el error se loguea en
 * consola.
 */
export async function verificarLimiteEnviosEstudiante(
  client: SupabaseClient,
  options: RateLimitDbOptions,
): Promise<RateLimitDbResult> {
  const {
    estudianteId,
    grupoId,
    cuatrimestreId,
    maxPerWindow = 10,
    windowMinutes = 10,
    maxPerCiclo = 200,
  } = options;

  try {
    // 1. Duplicado exacto.
    const duplicateQuery = client
      .from("encuesta_control_envio")
      .select("id")
      .eq("estudiante_id", estudianteId)
      .eq("grupo_id", grupoId);

    const { data: existente, error: duplicateError } = cuatrimestreId
      ? await duplicateQuery.eq("cuatrimestre_id", cuatrimestreId).maybeSingle()
      : await duplicateQuery.maybeSingle();

    if (duplicateError) {
      console.error("[rateLimit] error verificando duplicado", duplicateError);
    } else if (existente) {
      return {
        permitido: false,
        razon: "Ya enviaste una evaluación para este grupo",
      };
    }

    // 2. Ventana de tiempo.
    const since = new Date(
      Date.now() - windowMinutes * 60 * 1000,
    ).toISOString();
    const { count: enviosRecientes, error: windowError } = await client
      .from("encuesta_control_envio")
      .select("*", { count: "exact", head: true })
      .eq("estudiante_id", estudianteId)
      .gte("fecha_envio", since);

    if (windowError) {
      console.error("[rateLimit] error contando envíos recientes", windowError);
    } else if (enviosRecientes !== null && enviosRecientes >= maxPerWindow) {
      return {
        permitido: false,
        razon: `Demasiados envíos recientes (${enviosRecientes}). Esperá unos minutos.`,
        enviosRecientes,
      };
    }

    // 3. Total por ciclo.
    if (cuatrimestreId) {
      const { count: totalCiclo, error: cycleError } = await client
        .from("encuesta_control_envio")
        .select("*", { count: "exact", head: true })
        .eq("estudiante_id", estudianteId)
        .eq("cuatrimestre_id", cuatrimestreId);

      if (cycleError) {
        console.error(
          "[rateLimit] error contando envíos del ciclo",
          cycleError,
        );
      } else if (totalCiclo !== null && totalCiclo >= maxPerCiclo) {
        return {
          permitido: false,
          razon: `Límite de evaluaciones alcanzado para este ciclo (${totalCiclo})`,
          enviosRecientes: totalCiclo,
        };
      }
    }

    return { permitido: true };
  } catch (error) {
    console.error("[rateLimit] error inesperado", error);
    return { permitido: true };
  }
}
