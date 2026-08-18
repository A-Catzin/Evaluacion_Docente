/**
 * Servicio de Calificaciones Finales — punto único de entrada para leer y
 * recalcular calificaciones de docentes.
 *
 * Reglas de negocio (pesos, perfiles de modalidad y categorías) viven en
 * `scoring.ts`. No se duplican aquí ni en SQL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcFinalScore,
  fetchCuatrimestreScores,
  normalizarModalidad,
  obtenerPerfilModalidad,
  type InstrumentScores,
} from "./scoring";

export interface CalificacionFinal {
  id: number;
  docente_id: number;
  cuatrimestre_id: number;
  modalidad_snapshot: string;
  score_encuesta_estudiantil: number | null;
  score_coordinacion: number | null;
  score_planeacion: number | null;
  score_observacion: number | null;
  score_autoevaluacion: number | null;
  calificacion_final: number;
  categoria_final: string;
  num_instrumentos_completados: number;
  num_instrumentos_esperados: number;
  version_calculo: string;
  calculada_en: string;
}

const VERSION_CALCULO = "v2.1";

function round2(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowToCalificacion(row: Record<string, unknown>): CalificacionFinal {
  return {
    id: Number(row.id),
    docente_id: Number(row.docente_id),
    cuatrimestre_id: Number(row.cuatrimestre_id),
    modalidad_snapshot: String(row.modalidad_snapshot ?? ""),
    score_encuesta_estudiantil: round2(
      toNumber(row.score_encuesta_estudiantil),
    ),
    score_coordinacion: round2(toNumber(row.score_coordinacion)),
    score_planeacion: round2(toNumber(row.score_planeacion)),
    score_observacion: round2(toNumber(row.score_observacion)),
    score_autoevaluacion: round2(toNumber(row.score_autoevaluacion)),
    calificacion_final: Number(row.calificacion_final),
    categoria_final: String(row.categoria_final ?? ""),
    num_instrumentos_completados: Number(row.num_instrumentos_completados),
    num_instrumentos_esperados: Number(row.num_instrumentos_esperados),
    version_calculo: String(row.version_calculo ?? VERSION_CALCULO),
    calculada_en: String(row.calculada_en ?? ""),
  };
}

export async function obtenerCalificacionDocente(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number,
): Promise<CalificacionFinal | null> {
  const { data, error } = await client
    .from("calificaciones_finales")
    .select("*")
    .eq("docente_id", docenteId)
    .eq("cuatrimestre_id", cuatrimestreId)
    .maybeSingle();

  if (error)
    throw new Error(`Error al leer calificación final: ${error.message}`);
  if (!data) return null;
  return rowToCalificacion(data as Record<string, unknown>);
}

export async function obtenerCalificacionesPorCuatrimestre(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<CalificacionFinal[]> {
  const { data, error } = await client
    .from("calificaciones_finales")
    .select("*")
    .eq("cuatrimestre_id", cuatrimestreId);

  if (error)
    throw new Error(
      `Error al leer calificaciones por cuatrimestre: ${error.message}`,
    );
  return (data || []).map((row) =>
    rowToCalificacion(row as Record<string, unknown>),
  );
}

async function obtenerModalidadSnapshot(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number,
): Promise<string> {
  const { data: historico } = await client
    .from("docente_modalidad_historica")
    .select("modalidad_snapshot")
    .eq("docente_id", docenteId)
    .eq("cuatrimestre_id", cuatrimestreId)
    .maybeSingle();

  if (historico?.modalidad_snapshot) {
    return String(historico.modalidad_snapshot);
  }

  const { data: docente, error: errorDocente } = await client
    .from("docentes")
    .select("modalidad")
    .eq("id", docenteId)
    .maybeSingle();

  if (errorDocente) {
    throw new Error(
      `Error al leer modalidad del docente: ${errorDocente.message}`,
    );
  }
  if (!docente) {
    throw new Error(`No se encontró el docente ${docenteId}`);
  }

  const snapshot = String(docente.modalidad ?? "Escolarizada");

  const { error: errorSnapshot } = await client
    .from("docente_modalidad_historica")
    .insert({
      docente_id: docenteId,
      cuatrimestre_id: cuatrimestreId,
      modalidad_snapshot: snapshot,
      fuente: "primer_score",
    });

  if (errorSnapshot) {
    // Si ya existe por condición de carrera, no falla el cálculo.
    if (errorSnapshot.code !== "23505") {
      throw new Error(
        `Error al guardar snapshot de modalidad: ${errorSnapshot.message}`,
      );
    }
  }

  return snapshot;
}

export async function recalcularCalificacionDocente(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number,
): Promise<CalificacionFinal> {
  const modalidadSnapshot = await obtenerModalidadSnapshot(
    client,
    docenteId,
    cuatrimestreId,
  );
  const scores = await fetchCuatrimestreScores(
    client,
    docenteId,
    cuatrimestreId,
  );
  const final = calcFinalScore(scores, modalidadSnapshot);

  const profile = obtenerPerfilModalidad(modalidadSnapshot);

  const upsertPayload = {
    docente_id: docenteId,
    cuatrimestre_id: cuatrimestreId,
    modalidad_snapshot: modalidadSnapshot,
    score_encuesta_estudiantil: round2(scores.ee) ?? null,
    score_coordinacion: round2(scores.coord) ?? null,
    score_planeacion: round2(scores.plan) ?? null,
    score_observacion: round2(scores.obs) ?? null,
    score_autoevaluacion: round2(scores.auto) ?? null,
    calificacion_final: final.final,
    categoria_final: final.category,
    num_instrumentos_completados: final.instrumentCount,
    num_instrumentos_esperados: profile.expectedInstrumentCount,
    version_calculo: VERSION_CALCULO,
    calculada_en: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("calificaciones_finales")
    .upsert(upsertPayload, { onConflict: "docente_id,cuatrimestre_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Error al persistir calificación final: ${error.message}`);
  }
  if (!data) {
    throw new Error("Upsert de calificación final no devolvió datos");
  }

  return rowToCalificacion(data as Record<string, unknown>);
}

export async function refrescarResultadosAgregados(
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client.rpc("refrescar_resultados_agregados");
  if (error) {
    throw new Error(
      `Error al refrescar resultados agregados: ${error.message}`,
    );
  }
}

/**
 * Auxiliar para que los endpoints reporten errores de recálculo sin ocultar
 * el éxito de la operación principal.
 */
export function logRecalcError(
  docenteId: number,
  cuatrimestreId: number,
  error: unknown,
): void {
  console.error(
    `[Recálculo] Falló recalcularCalificacionDocente(docente=${docenteId}, cuatrimestre=${cuatrimestreId}):`,
    error,
  );
}

// Re-exportar utilidades puras que los consumidores puedan necesitar.
export { calcFinalScore, normalizarModalidad, obtenerPerfilModalidad };
export type { InstrumentScores };
