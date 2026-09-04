import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";
import {
  groupPlanningAssignmentsBySubjectName,
  normalizePlanningSubjectName,
} from "../../../lib/planningSubjectScope";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ["superadmin"]));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "Error interno", code: "planning_status_auth_failed" }, 500);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const docenteId = positiveInteger(body.docente_id);
    const cuatrimestreId = positiveInteger(body.cuatrimestre_id);
    const subjectKey = typeof body.subject_key === "string"
      ? normalizePlanningSubjectName(body.subject_key)
      : "";
    const action = body.action;
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";

    if (!docenteId || !cuatrimestreId || !subjectKey || (action !== "mark_np" && action !== "reactivate") || motivo.length > 500) {
      return json({ error: "Solicitud de estado de planeación inválida", code: "planning_status_invalid" }, 400);
    }

    const { data: assignments, error: assignmentsError } = await client
      .from("grupos")
      .select("id,clave,asignatura_id,asignaturas!inner(nombre)")
      .eq("docente_id", docenteId)
      .eq("cuatrimestre_id", cuatrimestreId)
      .eq("activo", true)
      .eq("modalidad", "Escolarizado");
    if (assignmentsError) return json({ error: "No fue posible validar la carga docente", code: "planning_status_scope_unavailable" }, 503);

    const scopes = groupPlanningAssignmentsBySubjectName(
      (assignments || []).flatMap((item: any) => item.asignaturas?.nombre
        ? [{ asignaturaId: item.asignatura_id, asignaturaNombre: item.asignaturas.nombre, grupo: item.clave }]
        : []),
    );
    const scope = scopes.find((item) => item.key === subjectKey);
    if (!scope) return json({ error: "La asignatura no pertenece a la carga activa del docente", code: "planning_status_scope_not_found" }, 404);

    if (action === "mark_np") {
      const { data: plans, error: plansError } = await client
        .from("planeaciones")
        .select("estado,asignaturas!inner(nombre)")
        .eq("docente_id", docenteId)
        .eq("cuatrimestre_id", cuatrimestreId)
        .eq("estado", "Aprobado");
      if (plansError) return json({ error: "No fue posible verificar planeaciones aprobadas", code: "planning_status_plan_unavailable" }, 503);
      if ((plans || []).some((plan: any) => normalizePlanningSubjectName(plan.asignaturas?.nombre) === scope.key)) {
        return json({ error: "No se puede marcar NP una asignatura con planeación aprobada", code: "planning_subject_approved" }, 409);
      }
    }

    const { data, error } = await client.rpc("set_planning_subject_np", {
      p_docente_id: docenteId,
      p_cuatrimestre_id: cuatrimestreId,
      p_subject_key: scope.key,
      p_subject_name: scope.nombre,
      p_motivo: motivo || null,
      p_mark_np: action === "mark_np",
    });
      if (error) return json({ error: "No fue posible actualizar el estado de planeación", code: "planning_status_persistence_rejected" }, error.code === "23514" ? 409 : 400);
      try {
        await recalcularCalificacionDocente(client, docenteId, cuatrimestreId);
      } catch (recalcError) {
        logRecalcError(docenteId, cuatrimestreId, recalcError);
        return json({ error: "El estado se actualizó, pero no fue posible recalcular la calificación", code: "planning_status_recalculation_failed" }, 503);
      }
      return json({ success: true, status: data });
  } catch {
    return json({ error: "Error interno", code: "planning_status_unexpected" }, 500);
  }
};
