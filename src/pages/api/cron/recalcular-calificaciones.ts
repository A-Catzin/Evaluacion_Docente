import type { APIRoute } from "astro";
import { isAuthorizedCron } from "../../../lib/cronAuth";
import { dbAdmin } from "../../../lib/db";
import { obtenerCuatrimestreActivo } from "../../../services/catalogos";
import {
  logRecalcError,
  recalcularCalificacionDocente,
  refrescarResultadosAgregados,
} from "../../../services/calificaciones";
import { cycleTeacherIds } from "../admin/recalcular-calificaciones";

export const prerender = false;

/** Teachers recalculated in parallel, and the time budget before returning a partial result. */
const CONCURRENCY = 12;
const TIME_BUDGET_MS = 50_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * GET /api/cron/recalcular-calificaciones
 * Daily Vercel Cron job: recalculates the final grades of the active cycle.
 * Requires `Authorization: Bearer <CRON_SECRET>` (Vercel adds it automatically).
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorizedCron(request.headers.get("authorization"), import.meta.env.CRON_SECRET ?? process.env.CRON_SECRET)) {
    return json({ error: "No autorizado" }, 401);
  }

  const started = Date.now();
  const client = dbAdmin();
  const cycle = await obtenerCuatrimestreActivo(client);
  if (!cycle) return json({ ok: true, skipped: "sin ciclo activo" });

  const ids = await cycleTeacherIds(cycle.id);
  const failed: number[] = [];
  // `?offset=N` resumes a run that stopped at the time budget (`nextOffset` in the response).
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  let processed = 0;
  for (let i = offset; i < ids.length && Date.now() - started < TIME_BUDGET_MS; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (docenteId) => {
        try {
          await recalcularCalificacionDocente(client, docenteId, cycle.id);
        } catch (error) {
          logRecalcError(docenteId, cycle.id, error);
          failed.push(docenteId);
        }
      }),
    );
    processed += chunk.length;
  }

  const nextOffset = offset + processed;
  const done = nextOffset >= ids.length;
  if (done) {
    try {
      await refrescarResultadosAgregados(client);
    } catch (error) {
      console.error("[Cron recálculo] Falló refrescarResultadosAgregados:", error);
    }
  }
  console.info("[Cron recálculo]", { cycle: cycle.id, total: ids.length, processed, failed: failed.length, done });
  return json({ cycle: cycle.id, total: ids.length, processed, failed, nextOffset, done }, done ? 200 : 206);
};
