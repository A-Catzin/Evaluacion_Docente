/**
 * Servicio de Calificaciones Finales — punto único de entrada para leer y
 * recalcular calificaciones de docentes.
 *
 * Reglas de negocio (pesos, perfiles de modalidad y categorías) viven en
 * `scoring.ts`. No se duplican aquí ni en SQL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSubjectAwareCuatrimestreScores } from "./scoring";

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
  instrument_validity: Record<string, string>;
  has_invalid_instrument: boolean;
  // Info del docente; se completa cuando el dashboard la necesita.
  docente_nombre?: string | null;
  docente_apellidos?: string | null;
  docente_email?: string | null;
  docente_campus?: string | null;
}

const VERSION_CALCULO = "v2.3-subject-aware-np";

function round2(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function subjectScopeValidity(
  subjects: Array<{ planningStatus: string }>,
): Array<[string, string]> {
  if (!subjects.length) return [];
  const counts = { approved: 0, np: 0, pending: 0 };
  for (const subject of subjects) {
    if (subject.planningStatus in counts)
      counts[subject.planningStatus as keyof typeof counts] += 1;
  }
  // calificaciones_finales is intentionally a global row; this preserves a
  // compact, auditable subject-status summary without a schema expansion.
  return [
    [
      "planning_subject_status",
      `approved=${counts.approved};np=${counts.np};pending=${counts.pending}`,
    ],
  ];
}

export function rowToCalificacion(
  row: Record<string, unknown>,
): CalificacionFinal {
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
    instrument_validity:
      (row.instrument_validity as Record<string, string> | null) ?? {},
    has_invalid_instrument: Boolean(row.has_invalid_instrument),
  };
}

export async function calcularCalificacionDocenteInline(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number,
  docenteInfo?: {
    nombre?: string | null;
    apellidos?: string | null;
    email?: string | null;
    campus?: string | null;
  },
): Promise<CalificacionFinal | null> {
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

  const modalidad = String(docente?.modalidad ?? "Escolarizado");
  const subjectAware = await fetchSubjectAwareCuatrimestreScores(
    client,
    docenteId,
    cuatrimestreId,
    modalidad,
  );
  const scores = subjectAware.aggregate;
  const final = subjectAware.final;

  // Si no hay ningún instrumento puntuable, no devolvemos fila inline.
  if (
    scores.ee == null &&
    scores.coord == null &&
    scores.plan == null &&
    scores.obs == null &&
    scores.auto == null
  )
    return null;

  return {
    id: 0,
    docente_id: docenteId,
    cuatrimestre_id: cuatrimestreId,
    modalidad_snapshot: modalidad,
    score_encuesta_estudiantil: round2(scores.ee) ?? null,
    score_coordinacion: round2(scores.coord) ?? null,
    score_planeacion: round2(scores.plan) ?? null,
    score_observacion: round2(scores.obs) ?? null,
    score_autoevaluacion: round2(scores.auto) ?? null,
    calificacion_final: final.final,
    categoria_final: final.category,
    num_instrumentos_completados: final.instrumentCount,
    num_instrumentos_esperados: final.expectedInstrumentCount,
    version_calculo: `${VERSION_CALCULO}-inline`,
    calculada_en: new Date().toISOString(),
    instrument_validity: Object.fromEntries([
      ...(scores.invalidPurposes || []).map(
        (purpose) => [purpose, "invalid_excessive_na"] as [string, string],
      ),
      ...subjectScopeValidity(subjectAware.subjects),
    ]),
    has_invalid_instrument: (scores.invalidPurposes || []).length > 0,
    docente_nombre: docenteInfo?.nombre ?? null,
    docente_apellidos: docenteInfo?.apellidos ?? null,
    docente_email: docenteInfo?.email ?? null,
    docente_campus: docenteInfo?.campus ?? null,
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
  if (data) return rowToCalificacion(data as Record<string, unknown>);

  return calcularCalificacionDocenteInline(client, docenteId, cuatrimestreId);
}

export async function obtenerCalificacionesPorDocenteYCuatrimestres(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreIds: number[],
): Promise<Map<number, CalificacionFinal>> {
  const result = new Map<number, CalificacionFinal>();
  const faltantes: number[] = [];

  // Batch read de filas precalculadas.
  if (cuatrimestreIds.length) {
    const { data, error } = await client
      .from("calificaciones_finales")
      .select("*")
      .eq("docente_id", docenteId)
      .in("cuatrimestre_id", cuatrimestreIds);

    if (error) {
      throw new Error(
        `Error al leer calificaciones por docente: ${error.message}`,
      );
    }

    for (const row of (data || []) as Record<string, unknown>[]) {
      const cal = rowToCalificacion(row);
      result.set(cal.cuatrimestre_id, cal);
    }
  }

  for (const cid of cuatrimestreIds) {
    if (!result.has(cid)) faltantes.push(cid);
  }

  for (const cid of faltantes) {
    const cal = await calcularCalificacionDocenteInline(client, docenteId, cid);
    if (cal) result.set(cid, cal);
  }

  return result;
}

async function leerInfoDocentes(
  client: SupabaseClient,
  docenteIds: number[],
): Promise<
  Map<
    number,
    { nombre: string; apellidos: string; email: string; campus: string }
  >
> {
  const map = new Map<
    number,
    { nombre: string; apellidos: string; email: string; campus: string }
  >();
  if (!docenteIds.length) return map;

  const { data, error } = await client
    .from("docentes")
    .select("id,nombre,apellidos,email,campus")
    .in("id", docenteIds);

  if (error) {
    throw new Error(`Error al leer info de docentes: ${error.message}`);
  }

  for (const row of (data || []) as any[]) {
    map.set(Number(row.id), {
      nombre: String(row.nombre ?? ""),
      apellidos: String(row.apellidos ?? ""),
      email: String(row.email ?? ""),
      campus: String(row.campus ?? ""),
    });
  }
  return map;
}

export async function obtenerCalificacionesPorCuatrimestre(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<CalificacionFinal[]> {
  const [{ data: precalculadas, error }, docenteIdsActividad] =
    await Promise.all([
      client
        .from("calificaciones_finales")
        .select("*")
        .eq("cuatrimestre_id", cuatrimestreId),
      obtenerDocentesConInstrumentos(client, cuatrimestreId),
    ]);

  if (error)
    throw new Error(
      `Error al leer calificaciones por cuatrimestre: ${error.message}`,
    );

  const precalculadasMap = new Map<number, CalificacionFinal>();
  for (const row of (precalculadas || []) as Record<string, unknown>[]) {
    const cal = rowToCalificacion(row);
    precalculadasMap.set(cal.docente_id, cal);
  }

  const resultados: CalificacionFinal[] = [...precalculadasMap.values()];
  const faltantes: number[] = [];

  for (const docenteId of docenteIdsActividad) {
    if (!precalculadasMap.has(docenteId)) {
      faltantes.push(docenteId);
    }
  }

  if (faltantes.length) {
    const infoDocentes = await leerInfoDocentes(client, faltantes);
    const inlineResults = await Promise.all(
      faltantes.map((docenteId) => {
        const info = infoDocentes.get(docenteId);
        return calcularCalificacionDocenteInline(
          client,
          docenteId,
          cuatrimestreId,
          info,
        );
      }),
    );
    for (const cal of inlineResults) {
      if (cal) resultados.push(cal);
    }
  }

  // Completar info de docente para las filas precalculadas que no la tengan.
  const idsSinInfo = resultados
    .filter((r) => !r.docente_nombre && !r.docente_apellidos)
    .map((r) => r.docente_id);
  if (idsSinInfo.length) {
    const infoDocentes = await leerInfoDocentes(client, idsSinInfo);
    for (const r of resultados) {
      const info = infoDocentes.get(r.docente_id);
      if (info) {
        r.docente_nombre = info.nombre;
        r.docente_apellidos = info.apellidos;
        r.docente_email = info.email;
        r.docente_campus = info.campus;
      }
    }
  }

  return resultados.sort((a, b) => a.docente_id - b.docente_id);
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

  const snapshot = String(docente.modalidad ?? "Escolarizado");

  const { error: errorSnapshot } = await client.rpc(
    "tomar_snapshot_modalidad",
    {
      p_docente_id: docenteId,
      p_cuatrimestre_id: cuatrimestreId,
      p_modalidad: snapshot,
      p_fuente: "primer_score",
    },
  );

  if (errorSnapshot) {
    throw new Error(
      `Error al guardar snapshot de modalidad: ${errorSnapshot.message}`,
    );
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
  const subjectAware = await fetchSubjectAwareCuatrimestreScores(
    client,
    docenteId,
    cuatrimestreId,
    modalidadSnapshot,
  );
  const scores = subjectAware.aggregate;
  const final = subjectAware.final;

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
    num_instrumentos_esperados: final.expectedInstrumentCount,
    version_calculo: VERSION_CALCULO,
    calculada_en: new Date().toISOString(),
    instrument_validity: Object.fromEntries([
      ...(scores.invalidPurposes || []).map(
        (purpose) => [purpose, "invalid_excessive_na"] as [string, string],
      ),
      ...subjectScopeValidity(subjectAware.subjects),
    ]),
    has_invalid_instrument: (scores.invalidPurposes || []).length > 0,
  };

  const { data, error } = await client.rpc("upsert_calificacion_final", {
    p_payload: upsertPayload,
  });

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

type TablaInstrumentoDocente =
  | "evaluacion_coordinacion"
  | "observaciones"
  | "planeaciones"
  | "autodiagnosticos"
  | "encuesta_estudiantil_respuestas";

const TABLAS_INSTRUMENTOS: TablaInstrumentoDocente[] = [
  "evaluacion_coordinacion",
  "observaciones",
  "planeaciones",
  "autodiagnosticos",
  "encuesta_estudiantil_respuestas",
];

async function obtenerDocentesConGrupos(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<number[]> {
  const { data, error } = await client
    .from("grupos")
    .select("docente_id")
    .eq("cuatrimestre_id", cuatrimestreId)
    .not("docente_id", "is", null);

  if (error) {
    throw new Error(`Error al leer grupos: ${error.message}`);
  }

  const ids = new Set<number>();
  for (const row of (data || []) as { docente_id: number | null }[]) {
    if (row.docente_id != null) ids.add(row.docente_id);
  }
  return [...ids].sort((a, b) => a - b);
}

async function obtenerDocentesConInstrumentos(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<number[]> {
  const ids = new Set<number>();
  for (const tabla of TABLAS_INSTRUMENTOS) {
    const { data, error } = await client
      .from(tabla)
      .select("docente_id")
      .eq("cuatrimestre_id", cuatrimestreId)
      .not("docente_id", "is", null);

    if (error) {
      throw new Error(`Error al leer ${tabla}: ${error.message}`);
    }
    for (const row of (data || []) as { docente_id: number | null }[]) {
      if (row.docente_id != null) ids.add(row.docente_id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export async function recalcularCalificacionesCuatrimestre(
  client: SupabaseClient,
  cuatrimestreId: number,
  options?: {
    refrescarAgregados?: boolean;
    soloDocentesConInstrumentos?: boolean;
  },
): Promise<{ recalculados: number; errores: number }> {
  const docenteIds = options?.soloDocentesConInstrumentos
    ? await obtenerDocentesConInstrumentos(client, cuatrimestreId)
    : await obtenerDocentesConGrupos(client, cuatrimestreId);

  let recalculados = 0;
  let errores = 0;
  for (const docenteId of docenteIds) {
    try {
      await recalcularCalificacionDocente(client, docenteId, cuatrimestreId);
      recalculados += 1;
    } catch (error) {
      logRecalcError(docenteId, cuatrimestreId, error);
      errores += 1;
    }
  }

  if (options?.refrescarAgregados) {
    try {
      await refrescarResultadosAgregados(client);
    } catch (error) {
      console.error(
        `[Recálculo batch] Falló refrescarResultadosAgregados(cuatrimestre=${cuatrimestreId}):`,
        error,
      );
    }
  }

  return { recalculados, errores };
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
