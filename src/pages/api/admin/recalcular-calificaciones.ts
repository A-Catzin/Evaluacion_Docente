import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { dbAdmin } from "../../../lib/db";
import {
  logRecalcError,
  recalcularCalificacionDocente,
  refrescarResultadosAgregados,
} from "../../../services/calificaciones";

/** Teachers per request, so each call stays well inside the serverless time limit. */
export const RECALC_BATCH_SIZE = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Teachers whose final grade belongs to the cycle: stored grades plus anyone with an observation. */
async function cycleTeacherIds(cycleId: number): Promise<number[]> {
  const admin = dbAdmin();
  const ids = new Set<number>();
  for (const [table, extra] of [["calificaciones_finales", null], ["instrument_submissions", "observation"]] as const) {
    let query = admin.from(table).select("docente_id").eq("cuatrimestre_id", cycleId);
    if (extra) query = query.eq("purpose", extra);
    const { data, error } = await query;
    if (error) throw new Error(`Error al leer ${table}: ${error.message}`);
    for (const row of (data || []) as { docente_id: number | null }[]) {
      if (row.docente_id != null) ids.add(row.docente_id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * POST /api/admin/recalcular-calificaciones  { cuatrimestre, offset }
 * Recalculates one batch of final grades; the caller repeats with `nextOffset` until `done`.
 */
export const POST: APIRoute = async ({ cookies, request }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ["superadmin"]));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    throw error;
  }

  const body = (await request.json().catch(() => ({}))) as { cuatrimestre?: unknown; offset?: unknown };
  const cycleId = Number(body.cuatrimestre);
  const offset = Number(body.offset ?? 0);
  if (!Number.isSafeInteger(cycleId) || cycleId < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    return json({ error: "Parámetros inválidos" }, 400);
  }

  let ids: number[];
  try {
    ids = await cycleTeacherIds(cycleId);
  } catch (error) {
    console.error("[Recálculo admin] No se pudo leer la lista de docentes:", error);
    return json({ error: "No se pudo leer la lista de docentes" }, 500);
  }

  const batch = ids.slice(offset, offset + RECALC_BATCH_SIZE);
  const failed: number[] = [];
  for (const docenteId of batch) {
    try {
      await recalcularCalificacionDocente(client, docenteId, cycleId);
    } catch (error) {
      logRecalcError(docenteId, cycleId, error);
      failed.push(docenteId);
    }
  }

  const nextOffset = offset + batch.length;
  const done = nextOffset >= ids.length;
  if (done) {
    try {
      await refrescarResultadosAgregados(client);
    } catch (error) {
      console.error("[Recálculo admin] Falló refrescarResultadosAgregados:", error);
    }
  }

  return json({ total: ids.length, processed: batch.length, failed, nextOffset, done });
};
