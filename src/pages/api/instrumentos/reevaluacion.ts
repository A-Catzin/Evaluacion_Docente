import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { dbAdmin } from "../../../lib/db";
import {
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
  validarCamposDeTextoLibreConLimites,
} from "../../../lib/moderation";
import { ObservationReevaluationSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 200_000;
const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

export const POST: APIRoute = async ({ request, cookies }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ["superadmin", "coordinador", "observador"]));
  } catch (error) {
    return error instanceof AuthError ? error.response : json({ error: "Error interno" }, 500);
  }

  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES)
      return json({ error: "Datos de reevaluación no válidos" }, 400);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
      return json({ error: "Datos de reevaluación no válidos" }, 400);
    const parsed = ObservationReevaluationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return json({ error: "Datos de reevaluación no válidos", detalles: formatZodFieldErrors(parsed.error) }, 400);
    const submission = parsed.data;
    const text = Object.fromEntries([
      ...submission.evidence.map((entry, index) => [`evidence_${index}`, entry.evidence]),
      ...submission.answers.filter((entry) => entry.value === "na")
        .map((entry, index) => [`na_reason_${index}`, entry.na_reason]),
      ...Object.entries(submission.metadata ?? {}),
    ]);
    const limits = Object.fromEntries([
      ...submission.evidence.map((_, index) => [`evidence_${index}`, MAX_NOTA_SECCION_LONGITUD]),
      ...submission.answers.filter((entry) => entry.value === "na")
        .map((_, index) => [`na_reason_${index}`, MAX_NOTA_SECCION_LONGITUD]),
      ...["strengths", "priority_area", "recommendation", "general_observations"]
        .map((key) => [key, MAX_COMENTARIO_LONGITUD]),
    ]);
    const moderation = validarCamposDeTextoLibreConLimites(text, limits);
    if (!moderation.valido)
      return json({ error: moderation.error || "Texto no permitido", code: "comment_rejected" }, 400);

    const { data, error } = await client.rpc("reevaluate_observation_instrument", {
      p_version_id: submission.version_id,
      p_docente_id: submission.docente_id,
      p_cuatrimestre_id: submission.cuatrimestre_id,
      p_asignatura_id: submission.asignatura_id,
      p_grupo: submission.grupo,
      p_supersedes_submission_id: submission.supersedes_submission_id,
      p_operation_id: submission.operation_id,
      p_answers: submission.answers,
      p_evidence: submission.evidence,
      p_metadata: submission.metadata ?? {},
    });
    if (error) {
      const status = error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      // In particular, never look up or return a receipt for a conflicting actor/operation.
      return json({ error: "No fue posible completar la reevaluación" }, status);
    }

    // The submission commits inside the RPC. A failed recalculation cannot roll it back;
    // each exact-operation retry re-attempts recalculation with service-role reads.
    try {
      await recalcularCalificacionDocente(dbAdmin(), submission.docente_id, submission.cuatrimestre_id);
    } catch (recalcError) {
      logRecalcError(submission.docente_id, submission.cuatrimestre_id, recalcError);
    }
    return json({ success: true, ...(data as object) }, 201);
  } catch {
    return json({ error: "Datos de reevaluación no válidos" }, 400);
  }
};
