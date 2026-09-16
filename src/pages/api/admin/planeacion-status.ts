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

// Subject NP batches stay deliberately small because each item also recalculates a teacher grade.
const MAX_BATCH_SIZE = 50;
// Group NP applies one atomic RPC transaction to a filtered selection. This accommodates
// cycles with hundreds of visible assignments while bounding locks and audit work.
const MAX_GROUP_NP_BATCH_SIZE = 1000;
type PlanningAction = "mark_np" | "reactivate";
type GroupNpAction = "mark_group_np" | "reactivate_group_np";
type RequestedItem = { docenteId: number; subjectKey: string };
type ResolvedItem = RequestedItem & { subjectName: string };
type GroupNpItem = { grupoId: number };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647
    ? value
    : null;
}

function parseItem(value: unknown): RequestedItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const docenteId = positiveInteger(item.docente_id);
  const subjectKey =
    typeof item.subject_key === "string"
      ? normalizePlanningSubjectName(item.subject_key)
      : "";
  return docenteId && subjectKey ? { docenteId, subjectKey } : null;
}

function itemSignature(item: RequestedItem) {
  return `${item.docenteId}:${item.subjectKey}`;
}

function parseGroupNpItem(value: unknown): GroupNpItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const grupoId = positiveInteger((value as Record<string, unknown>).grupo_id);
  return grupoId ? { grupoId } : null;
}

async function setGroupNpStatus(
  client: any,
  body: Record<string, unknown>,
  action: GroupNpAction,
) {
  const cuatrimestreId = positiveInteger(body.cuatrimestre_id);
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  const hasBatchItems = Object.hasOwn(body, "items");
  const requestedItems = hasBatchItems
    ? Array.isArray(body.items)
      ? body.items.map(parseGroupNpItem)
      : []
    : [parseGroupNpItem(body)];

  if (
    !cuatrimestreId ||
    motivo.length > 500 ||
    requestedItems.length === 0 ||
    requestedItems.length > MAX_GROUP_NP_BATCH_SIZE ||
    requestedItems.some((item) => !item)
  )
    return json(
      {
        error: "Solicitud de estado NP por grupo inválida",
        code: "planning_group_np_invalid",
      },
      400,
    );

  const items = requestedItems as GroupNpItem[];
  const groupIds = items.map((item) => item.grupoId);
  if (new Set(groupIds).size !== groupIds.length)
    return json(
      {
        error: "La selección contiene grupos duplicados",
        code: "planning_group_np_duplicate_items",
      },
      400,
    );

  // The RPC resolves the current group assignment itself under a row lock. The
  // browser supplies only an opaque group ID, never teacher or subject scope.
  const { data, error } = await client.rpc("set_planning_group_np_bulk", {
    p_cuatrimestre_id: cuatrimestreId,
    p_items: items.map((item) => ({ grupo_id: item.grupoId })),
    p_motivo: motivo || null,
    p_mark_np: action === "mark_group_np",
  });
  if (error)
    return json(
      {
        error: "No fue posible actualizar el estado NP del grupo",
        code: "planning_group_np_persistence_rejected",
      },
      error.code === "23514" || error.code === "22023" ? 409 : 400,
    );

  // This deliberately does not recalculate grades: group NP is an
  // administrative assignment exception, not a planning-record change.
  return json({
    success: true,
    status: hasBatchItems ? data : Array.isArray(data) ? data[0] : data,
  });
}

export const POST: APIRoute = async ({ cookies, request }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ["superadmin"]));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json(
      { error: "Error interno", code: "planning_status_auth_failed" },
      500,
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as PlanningAction | GroupNpAction;
    if (action === "mark_group_np" || action === "reactivate_group_np")
      return setGroupNpStatus(client, body, action);

    const cuatrimestreId = positiveInteger(body.cuatrimestre_id);
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
    const hasBatchItems = Object.hasOwn(body, "items");
    const requestedItems = hasBatchItems
      ? Array.isArray(body.items)
        ? body.items.map(parseItem)
        : []
      : [parseItem(body)];

    if (
      !cuatrimestreId ||
      (action !== "mark_np" && action !== "reactivate") ||
      motivo.length > 500 ||
      requestedItems.length === 0 ||
      requestedItems.length > MAX_BATCH_SIZE ||
      requestedItems.some((item) => !item)
    ) {
      return json(
        {
          error: "Solicitud de estado de planeación inválida",
          code: "planning_status_invalid",
        },
        400,
      );
    }

    const items = requestedItems as RequestedItem[];
    const signatures = new Set(items.map(itemSignature));
    if (signatures.size !== items.length) {
      return json(
        {
          error: "La selección contiene asignaturas duplicadas",
          code: "planning_status_duplicate_items",
        },
        400,
      );
    }

    const teacherIds = [...new Set(items.map((item) => item.docenteId))];
    const { data: assignments, error: assignmentsError } = await client
      .from("grupos")
      .select("docente_id,id,clave,asignatura_id,asignaturas!inner(nombre)")
      .in("docente_id", teacherIds)
      .eq("cuatrimestre_id", cuatrimestreId)
      .eq("activo", true)
      .eq("modalidad", "Escolarizado");
    if (assignmentsError)
      return json(
        {
          error: "No fue posible validar la carga docente",
          code: "planning_status_scope_unavailable",
        },
        503,
      );

    const scopesByItem = new Map<string, { key: string; nombre: string }>();
    for (const docenteId of teacherIds) {
      const scopes = groupPlanningAssignmentsBySubjectName(
        (assignments || []).flatMap((item: any) =>
          item.docente_id === docenteId && item.asignaturas?.nombre
            ? [
                {
                  asignaturaId: item.asignatura_id,
                  asignaturaNombre: item.asignaturas.nombre,
                  grupo: item.clave,
                },
              ]
            : [],
        ),
      );
      for (const scope of scopes)
        scopesByItem.set(`${docenteId}:${scope.key}`, scope);
    }

    // Subject display names from the browser are deliberately ignored. The canonical
    // scope name below comes only from active Escolarizado assignments for this cycle.
    const resolvedItems: ResolvedItem[] = [];
    for (const item of items) {
      const scope = scopesByItem.get(itemSignature(item));
      if (!scope)
        return json(
          {
            error: "Una asignatura no pertenece a la carga activa del docente",
            code: "planning_status_scope_not_found",
          },
          404,
        );
      resolvedItems.push({ ...item, subjectName: scope.nombre });
    }

    const { data: approvedPlans, error: plansError } = await client
      .from("planeaciones")
      .select("docente_id,asignaturas!inner(nombre)")
      .in("docente_id", teacherIds)
      .eq("cuatrimestre_id", cuatrimestreId)
      .eq("estado", "Aprobado");
    if (plansError)
      return json(
        {
          error: "No fue posible verificar planeaciones aprobadas",
          code: "planning_status_plan_unavailable",
        },
        503,
      );

    const approvedScopes = new Set(
      (approvedPlans || []).map(
        (plan: any) =>
          `${plan.docente_id}:${normalizePlanningSubjectName(plan.asignaturas?.nombre)}`,
      ),
    );
    if (
      action === "mark_np" &&
      resolvedItems.some((item) => approvedScopes.has(itemSignature(item)))
    ) {
      return json(
        {
          error: "No se puede marcar NP una asignatura con planeación aprobada",
          code: "planning_subject_approved",
        },
        409,
      );
    }

    if (action === "reactivate") {
      const { data: npRecords, error: npError } = await client
        .from("planning_subject_np")
        .select("docente_id,subject_key")
        .in("docente_id", teacherIds)
        .eq("cuatrimestre_id", cuatrimestreId)
        .eq("estado", "NP");
      if (npError)
        return json(
          {
            error: "No fue posible verificar los registros NP",
            code: "planning_status_np_unavailable",
          },
          503,
        );
      const npScopes = new Set(
        (npRecords || []).map(
          (record: any) =>
            `${record.docente_id}:${normalizePlanningSubjectName(record.subject_key)}`,
        ),
      );
      if (resolvedItems.some((item) => !npScopes.has(itemSignature(item)))) {
        return json(
          {
            error: "La reactivación solo permite asignaturas actualmente NP",
            code: "planning_status_reactivate_ineligible",
          },
          409,
        );
      }
    }

    const { data, error } = await client.rpc("set_planning_subject_np_bulk", {
      p_cuatrimestre_id: cuatrimestreId,
      p_items: resolvedItems.map((item) => ({
        docente_id: item.docenteId,
        subject_key: item.subjectKey,
        subject_name: item.subjectName,
      })),
      p_motivo: motivo || null,
      p_mark_np: action === "mark_np",
    });
    if (error)
      return json(
        {
          error: "No fue posible actualizar el estado de planeación",
          code: "planning_status_persistence_rejected",
        },
        error.code === "23514" ? 409 : 400,
      );

    for (const docenteId of teacherIds) {
      try {
        await recalcularCalificacionDocente(client, docenteId, cuatrimestreId);
      } catch (recalcError) {
        logRecalcError(docenteId, cuatrimestreId, recalcError);
        return json(
          {
            error:
              "El estado se actualizó, pero no fue posible recalcular la calificación",
            code: "planning_status_recalculation_failed",
          },
          503,
        );
      }
    }
    return json({
      success: true,
      status: hasBatchItems ? data : Array.isArray(data) ? data[0] : data,
    });
  } catch {
    return json(
      { error: "Error interno", code: "planning_status_unexpected" },
      500,
    );
  }
};
