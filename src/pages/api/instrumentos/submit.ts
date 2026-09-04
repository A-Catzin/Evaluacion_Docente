import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  validarCamposDeTextoLibreConLimites,
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
} from "../../../lib/moderation";
import { VersionedInstrumentSubmissionSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";
import { notificarDocente } from "../../../services/notificaciones";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const POST: APIRoute = async ({ request, cookies }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, [
      "superadmin",
      "coordinador",
      "observador",
    ]));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  try {
    const parsed = VersionedInstrumentSubmissionSchema.safeParse(
      await request.json(),
    );
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Datos del instrumento no válidos",
          detalles: formatZodFieldErrors(parsed.error),
        }),
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const submission = parsed.data;
    const correctionReason =
      submission.metadata.general_observations?.trim() || null;
    const invalidPlanningSubmission =
      submission.source_record_id != null &&
      submission.answers.filter((answer) => answer.value === "na").length *
        100 >
        submission.answers.length * 20;
    if (invalidPlanningSubmission && !correctionReason) {
      return new Response(
        JSON.stringify({
          error: "El motivo de corrección es obligatorio",
          code: "correction_reason_required",
        }),
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const moderation = validarCamposDeTextoLibreConLimites(
      {
        ...Object.fromEntries(
          submission.evidence.map((entry, index) => [
            `evidence_${index}`,
            entry.evidence,
          ]),
        ),
        ...Object.fromEntries(
          submission.answers
            .filter((entry) => entry.value === "na")
            .map((entry, index) => [`na_reason_${index}`, entry.na_reason]),
        ),
        ...submission.metadata,
      },
      Object.fromEntries([
        ...submission.evidence.map((_, index) => [
          `evidence_${index}`,
          MAX_NOTA_SECCION_LONGITUD,
        ]),
        ...submission.answers
          .filter((entry) => entry.value === "na")
          .map((_, index) => [`na_reason_${index}`, MAX_NOTA_SECCION_LONGITUD]),
        ["strengths", MAX_COMENTARIO_LONGITUD],
        ["priority_area", MAX_COMENTARIO_LONGITUD],
        ["recommendation", MAX_COMENTARIO_LONGITUD],
        ["general_observations", MAX_COMENTARIO_LONGITUD],
      ]),
    );
    if (!moderation.valido)
      return new Response(
        JSON.stringify({ error: moderation.error, code: "comment_rejected" }),
        { status: 400, headers: JSON_HEADERS },
      );

    const { data, error } = await client.rpc("submit_versioned_instrument", {
      p_version_id: submission.version_id,
      p_docente_id: submission.docente_id,
      p_cuatrimestre_id: submission.cuatrimestre_id,
      p_asignatura_id: submission.asignatura_id ?? null,
      p_grupo: submission.grupo ?? null,
      p_source_record_id: submission.source_record_id ?? null,
      p_answers: submission.answers,
      p_evidence: submission.evidence,
      p_checks: submission.checks,
      p_metadata: submission.metadata,
    });
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.code === "42501" ? 403 : 400,
        headers: JSON_HEADERS,
      });

    try {
      await recalcularCalificacionDocente(
        client,
        submission.docente_id,
        submission.cuatrimestre_id,
      );
    } catch (recalcError) {
      logRecalcError(
        submission.docente_id,
        submission.cuatrimestre_id,
        recalcError,
      );
    }
    const result = data as { validity_status?: string };
    if (
      invalidPlanningSubmission &&
      result.validity_status === "invalid_excessive_na" &&
      correctionReason
    ) {
      try {
        await notificarDocente(
          submission.docente_id,
          "Planeación marcada para corrección",
          `Tu planeación fue enviada a corrección. Motivo de corrección: ${correctionReason}`,
          "/docente/planeaciones",
        );
      } catch (notificationError) {
        console.error(
          "[Instrumentos] Error notificando corrección de planeación:",
          notificationError,
        );
      }
    }
    return new Response(
      JSON.stringify({ success: true, ...(data as object) }),
      { status: 201, headers: JSON_HEADERS },
    );
  } catch {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
