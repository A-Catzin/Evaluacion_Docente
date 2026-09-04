import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";
import { canManageCoordinatedTeacher } from "../../../lib/teacherAssignments";
import {
  MAX_COMENTARIO_LONGITUD,
  validarCamposDeTextoLibreConLimites,
} from "../../../lib/moderation";

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  try {
    const auth = await requireRole(cookies, ["superadmin", "coordinador"]);
    cl = auth.client;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }

  try {
    const body = await request.json();
    const {
      id,
      puntaje,
      estado,
      comentario_retroalimentacion,
      evaluacion_detalle,
      observaciones_generales,
      no_aplica_count,
    } = body;

    if (estado !== "Aprobado" && estado !== "Corrección") {
      return new Response(
        JSON.stringify({ error: "Estado de planeación no válido" }),
        { status: 400 },
      );
    }

    const moderation = validarCamposDeTextoLibreConLimites(
      { comentario_retroalimentacion, observaciones_generales },
      {
        comentario_retroalimentacion: MAX_COMENTARIO_LONGITUD,
        observaciones_generales: MAX_COMENTARIO_LONGITUD,
      },
    );
    if (!moderation.valido) {
      return new Response(
        JSON.stringify({ error: moderation.error, code: "comment_rejected" }),
        { status: 400 },
      );
    }
    const correctionReason = moderation.valores.comentario_retroalimentacion;
    if (estado === "Corrección" && !correctionReason) {
      return new Response(
        JSON.stringify({
          error: "El motivo de corrección es obligatorio",
          code: "correction_reason_required",
        }),
        { status: 400 },
      );
    }

    const { data: plan, error: planError } = await cl
      .from("planeaciones")
      .select("docente_id,cuatrimestre_id")
      .eq("id", id)
      .maybeSingle();
    if (planError || !plan)
      return new Response(
        JSON.stringify({ error: "Planeación no encontrada" }),
        { status: 404 },
      );
    if (
      !(await canManageCoordinatedTeacher(
        cl,
        Number(plan.docente_id),
        Number(plan.cuatrimestre_id),
      ))
    ) {
      return new Response(
        JSON.stringify({
          error: "No tienes asignación de coordinación para esta planeación",
        }),
        { status: 403 },
      );
    }

    const { error } = await cl
      .from("planeaciones")
      .update({
        puntaje_promedio: puntaje,
        estado,
        comentario_retroalimentacion: correctionReason,
        evaluacion_detalle: evaluacion_detalle || null,
        observaciones_generales: moderation.valores.observaciones_generales,
        no_aplica_count: no_aplica_count || 0,
        fecha_evaluacion: new Date().toISOString(),
      })
      .eq("id", id);
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });

    // Notificar al docente y recalcular calificación final
    try {
      if (plan) {
        const tipo =
          estado === "Aprobado" ? "aprobada" : "marcada para corrección";
        try {
          const { notificarDocente } = await import(
            "../../../services/notificaciones"
          );
          await notificarDocente(
            plan.docente_id,
            `Planeación ${tipo}`,
            `Tu planeación ha sido ${tipo}. Puntaje: ${puntaje}%${estado === "Corrección" ? ` Motivo de corrección: ${correctionReason}` : ""}`,
            `/docente/planeaciones`,
          );
        } catch (err) {
          console.error(
            "[Coordinador Planeación] Error notificando docente:",
            err,
          );
        }
        try {
          await recalcularCalificacionDocente(
            cl,
            Number(plan.docente_id),
            Number(plan.cuatrimestre_id),
          );
        } catch (recalcError) {
          logRecalcError(
            Number(plan.docente_id),
            Number(plan.cuatrimestre_id),
            recalcError,
          );
        }
      }
    } catch (err) {
      console.error("[Coordinador Planeación] Error post-actualización:", err);
    }

    return new Response(JSON.stringify({ success: true, puntaje }), {
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
