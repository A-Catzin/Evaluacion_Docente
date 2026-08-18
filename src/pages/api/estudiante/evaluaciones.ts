import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { validarComentarioOpcional } from "../../../lib/moderation";
import {
  checkRequestBodySize,
  MAX_EVALUACION_BODY_BYTES,
  verificarLimiteEnviosEstudiante,
} from "../../../lib/rateLimit";
import { EstudianteEvaluacionSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let client;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ["estudiante"]);
    client = auth.client;
    userId = auth.user.id;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    console.error("[student evaluations] authentication failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return json(
      {
        error: "No fue posible verificar la sesión",
        code: "session_validation_failed",
      },
      502,
    );
  }

  const sizeCheck = checkRequestBodySize(request, MAX_EVALUACION_BODY_BYTES);
  if (!sizeCheck.ok) {
    return json({ error: sizeCheck.error, code: "payload_too_large" }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: "La solicitud no es válida", code: "invalid_request" },
      400,
    );
  }

  const parseResult = EstudianteEvaluacionSchema.safeParse(body);
  if (!parseResult.success) {
    return json(
      {
        error: "Completa las 19 respuestas con valores válidos",
        code: "invalid_answers",
        detalles: formatZodFieldErrors(parseResult.error),
      },
      400,
    );
  }

  const { grupo_id, respuestas, comentario } = parseResult.data;

  const moderacion = validarComentarioOpcional(comentario, 500);
  if (!moderacion.valido) {
    return json({ error: moderacion.error, code: "comment_rejected" }, 400);
  }
  const comment = moderacion.valorNormalizado;

  try {
    // Verificar límite de frecuencia usando la tabla de control de envíos.
    const { data: perfil, error: perfilError } = await client
      .from("usuarios")
      .select("entidad_id")
      .eq("id", userId)
      .maybeSingle();
    if (!perfilError && perfil?.entidad_id) {
      const { data: grupo } = await client
        .from("grupos")
        .select("cuatrimestre_id")
        .eq("id", grupo_id)
        .maybeSingle();
      const rateCheck = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: perfil.entidad_id,
        grupoId: grupo_id,
        cuatrimestreId: grupo?.cuatrimestre_id ?? null,
      });
      if (!rateCheck.permitido) {
        return json({ error: rateCheck.razon, code: "rate_limited" }, 429);
      }
    }

    const { data, error } = await client.rpc("enviar_encuesta_estudiante", {
      p_grupo_id: grupo_id,
      p_respuestas: respuestas,
      p_comentario: comment,
    });
    if (error) {
      if (error.code === "42501")
        return json(
          {
            error: "No tienes acceso para enviar evaluaciones",
            code: "forbidden",
          },
          403,
        );
      console.error("[student evaluations] submission RPC failed", {
        code: error.code,
        message: error.message,
      });
      return json(
        {
          error: "No fue posible registrar la evaluación",
          code: "submission_failed",
        },
        502,
      );
    }

    const result = Array.isArray(data) ? data[0] : null;
    const status =
      isRecord(result) && typeof result.status === "string"
        ? result.status
        : "";
    if (status === "completed") {
      let recalcDocenteId = 0;
      let recalcCuatrimestreId = 0;
      try {
        const { data: grupo } = await client
          .from("grupos")
          .select("docente_id,cuatrimestre_id")
          .eq("id", grupo_id)
          .maybeSingle();
        if (grupo?.docente_id && grupo?.cuatrimestre_id) {
          recalcDocenteId = Number(grupo.docente_id);
          recalcCuatrimestreId = Number(grupo.cuatrimestre_id);
          await recalcularCalificacionDocente(
            client,
            recalcDocenteId,
            recalcCuatrimestreId,
          );
        }
      } catch (recalcError) {
        logRecalcError(recalcDocenteId, recalcCuatrimestreId, recalcError);
      }
      return json({ status }, 201);
    }
    if (status === "already_submitted")
      return json({ status, error: "Esta evaluación ya fue completada" }, 409);
    if (status === "no_active_cycle")
      return json(
        { status, error: "No hay un ciclo activo para recibir evaluaciones" },
        409,
      );
    if (status === "not_enrolled")
      return json({ status, error: "No puedes evaluar este grupo" }, 403);
    if (status === "invalid_answers" || status === "invalid_comment") {
      return json(
        { status, error: "La información enviada no es válida" },
        400,
      );
    }

    return json(
      {
        error: "No fue posible registrar la evaluación",
        code: "submission_failed",
      },
      502,
    );
  } catch (error) {
    console.error("[student evaluations] session validation failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return json(
      {
        error: "No fue posible verificar la sesión",
        code: "session_validation_failed",
      },
      502,
    );
  }
};
