import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { validarComentarioOpcional } from "../../../lib/moderation";
import { CoordinacionEvaluacionSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ["superadmin", "coordinador"]);
    cl = auth.client;
    userId = auth.user.id;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }

  try {
    const body = await request.json();
    const parseResult = CoordinacionEvaluacionSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Datos de evaluación no válidos",
          detalles: formatZodFieldErrors(parseResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const {
      docente_id,
      cuatrimestre_id,
      ciclo,
      campus,
      comentarios,
      ...answers
    } = parseResult.data;

    const moderacion = validarComentarioOpcional(comentarios, 500);
    if (!moderacion.valido) {
      return new Response(
        JSON.stringify({ error: moderacion.error, code: "comment_rejected" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data, error } = await cl
      .from("evaluacion_coordinacion")
      .insert({
        docente_id,
        cuatrimestre_id,
        evaluador_id: userId,
        ciclo,
        campus,
        comentarios: moderacion.valorNormalizado,
        ...answers,
      })
      .select("puntos_obtenidos,score_normalizado")
      .single();

    if (error) {
      if (error.code === "23505")
        return new Response(
          JSON.stringify({
            error: "Ya evaluaste a este docente en este cuatrimestre",
          }),
          { status: 409 },
        );
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });
    }

    try {
      await recalcularCalificacionDocente(cl, docente_id, cuatrimestre_id);
    } catch (recalcError) {
      logRecalcError(docente_id, cuatrimestre_id, recalcError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        puntos: data.puntos_obtenidos,
        score: Math.round(data.score_normalizado),
      }),
      { status: 201 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
