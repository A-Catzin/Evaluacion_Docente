import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  try {
    const auth = await requireRole(cookies, ["superadmin", "coordinador"]);
    cl = auth.client;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
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

    const { error } = await cl
      .from("planeaciones")
      .update({
        puntaje_promedio: puntaje,
        estado,
        comentario_retroalimentacion: comentario_retroalimentacion || null,
        evaluacion_detalle: evaluacion_detalle || null,
        observaciones_generales: observaciones_generales || null,
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
      const { data: plan } = await cl
        .from("planeaciones")
        .select("docente_id,cuatrimestre_id")
        .eq("id", id)
        .maybeSingle();
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
            `Tu planeación ha sido ${tipo}. Puntaje: ${puntaje}%`,
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
