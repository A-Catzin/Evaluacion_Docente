import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { validarComentarioOpcional } from "../../../lib/moderation";
import { normalizePlanningSubjectName } from "../../../lib/planningSubjectScope";
import { isPlanningSubjectMarkedNp } from "../../../lib/planningSubjectStatus";
import {
  estaHabilitadoR2,
  obtenerCabeceraArchivoR2,
  obtenerUrlPublica,
} from "../../../lib/storage";
import {
  isTeacherPlanningPdfPath,
  parsePositiveInteger,
  requireTeacherPlanningSubmissionOpen,
  resolveTeacherPlanningGroup,
  validatePlanningPdfMetadata,
} from "../../../lib/planningSubmissionWindow";

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Persists only an object that was uploaded to the authenticated teacher's
 * server-minted namespace and whose R2 metadata still matches the request.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  let auth;
  try {
    auth = await requireRole(cookies, ["docente"]);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json(
      { error: "Error interno", code: "planning_upload_unexpected" },
      500,
    );
  }

  const body = await readJsonObject(request);
  if (!body) return json({ error: "Solicitud de carga inválida." }, 400);
  const cuatrimestreId = parsePositiveInteger(body.cuatrimestre_id);
  const asignaturaId = parsePositiveInteger(body.asignatura_id);
  const grupo = typeof body.grupo === "string" ? body.grupo.trim() : "";
  const planId = parsePositiveInteger(body.plan_id);
  const pdf = validatePlanningPdfMetadata(
    body.file_name,
    body.content_type,
    body.file_size,
  );
  if (!cuatrimestreId || !asignaturaId || !grupo || !pdf.ok) {
    return json(
      {
        error: pdf.ok
          ? "Asignatura, grupo o cuatrimestre inválido."
          : pdf.error,
      },
      400,
    );
  }
  if (body.modalidad && body.modalidad !== "Escolarizado") {
    return json(
      { error: "Solo se aceptan planeaciones en modalidad Escolarizado" },
      400,
    );
  }
  if (!estaHabilitadoR2()) {
    return json(
      {
        error: "La carga directa de archivos no está disponible temporalmente.",
        code: "r2_direct_upload_unavailable",
      },
      503,
    );
  }

  try {
    const { data: user, error: userError } = await auth.client
      .from("usuarios")
      .select("entidad_id,rol")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (userError)
      return json(
        { error: "No fue posible verificar tu perfil docente." },
        503,
      );
    if (!user || user.rol !== "docente" || !user.entidad_id)
      return json({ error: "Solo docentes" }, 403);
    if (!isTeacherPlanningPdfPath(body.path, cuatrimestreId, user.entidad_id)) {
      return json(
        {
          error: "La referencia del archivo no es válida.",
          code: "planning_upload_path_invalid",
        },
        403,
      );
    }

    const { data: docente, error: docenteError } = await auth.client
      .from("docentes")
      .select("campus,turno")
      .eq("id", user.entidad_id)
      .maybeSingle();
    if (docenteError || !docente) {
      return json({ error: "No fue posible verificar tu perfil docente" }, 403);
    }

    const denied = await requireTeacherPlanningSubmissionOpen(
      auth.client,
      cuatrimestreId,
    );
    if (denied) return denied;

    const groupResolution = await resolveTeacherPlanningGroup(
      auth.client,
      user.entidad_id,
      cuatrimestreId,
      asignaturaId,
      grupo,
    );
    if (groupResolution.status === "query_error") {
      return json(
        {
          error: "No fue posible verificar tu asignación docente.",
          code: "planning_assignment_unavailable",
        },
        503,
      );
    }
    if (groupResolution.status === "ambiguous") {
      return json(
        {
          error:
            "Se detectó una asignación duplicada para esta materia y grupo. Solicita revisión administrativa.",
          code: "planning_assignment_ambiguous",
        },
        409,
      );
    }
    if (groupResolution.status !== "ok") {
      return json(
        {
          error:
            "La asignatura y el grupo no corresponden a tu carga escolarizada del cuatrimestre.",
        },
        403,
      );
    }
    const group = groupResolution.group;

    const { data: assignedGroups, error: assignedGroupsError } =
      await auth.client
        .from("grupos")
        .select("id,clave,asignatura_id,modalidad,asignaturas!inner(nombre)")
        .eq("docente_id", user.entidad_id)
        .eq("cuatrimestre_id", cuatrimestreId)
        .eq("activo", true)
        .eq("modalidad", "Escolarizado");
    if (assignedGroupsError)
      return json(
        { error: "No fue posible validar los grupos cubiertos." },
        503,
      );
    const assignedGroupIds = (assignedGroups || []).map((item: any) => item.id);
    const { data: groupNpRecords, error: groupNpError } = await auth.client
      .from("planning_group_np")
      .select("grupo_id,estado")
      .eq("cuatrimestre_id", cuatrimestreId)
      .in("grupo_id", assignedGroupIds);
    if (groupNpError)
      return json(
        {
          error: "No fue posible verificar el estado NP de los grupos.",
          code: "planning_group_np_unavailable",
        },
        503,
      );
    const npGroupIds = new Set(
      (groupNpRecords || [])
        .filter((record: any) => record.estado === "NP")
        .map((record: any) => record.grupo_id),
    );
    if (npGroupIds.has(group.id)) {
      return json(
        {
          error:
            "Este grupo fue marcado como no presentado por administración y no admite cargas hasta que sea reactivado.",
          code: "planning_group_marked_np",
        },
        409,
      );
    }
    const eligibleAssignedGroups = (assignedGroups || []).filter(
      (item: any) => !npGroupIds.has(item.id),
    );
    const selectedAssignment = eligibleAssignedGroups.find(
      (item: any) =>
        item.asignatura_id === asignaturaId && item.clave === group.clave,
    ) as any;
    const subjectKey = normalizePlanningSubjectName(
      selectedAssignment?.asignaturas?.nombre,
    );
    if (!subjectKey)
      return json(
        { error: "No fue posible identificar la asignatura seleccionada." },
        403,
      );

    const { data: npRecords, error: npError } = await auth.client
      .from("planning_subject_np")
      .select("subject_key,estado")
      .eq("docente_id", user.entidad_id)
      .eq("cuatrimestre_id", cuatrimestreId);
    if (npError)
      return json(
        {
          error:
            "No fue posible verificar el estado administrativo de la asignatura.",
          code: "planning_subject_status_unavailable",
        },
        503,
      );
    if (
      isPlanningSubjectMarkedNp(
        selectedAssignment?.asignaturas?.nombre,
        (npRecords || []) as any[],
      )
    ) {
      return json(
        {
          error:
            "Esta asignatura fue marcada como no presentada por administración y no admite cargas hasta que sea reactivada.",
          code: "planning_subject_marked_np",
        },
        409,
      );
    }

    const coveredAssignments = eligibleAssignedGroups.filter(
      (item: any) =>
        normalizePlanningSubjectName(item.asignaturas?.nombre) === subjectKey,
    ) as any[];
    const gruposCubiertos = [
      ...new Set(coveredAssignments.map((item) => String(item.clave))),
    ].sort();
    const requestedGroups = Array.isArray(body.grupos_cubiertos)
      ? [
          ...new Set(
            body.grupos_cubiertos
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ].sort()
      : [];
    if (
      !requestedGroups.length ||
      requestedGroups.length !== gruposCubiertos.length ||
      requestedGroups.some((item, index) => item !== gruposCubiertos[index])
    ) {
      return json(
        {
          error:
            "Los grupos cubiertos ya no coinciden con tu carga; actualiza la página.",
          code: "planning_subject_scope_conflict",
        },
        409,
      );
    }

    const { data: subjectPlans, error: subjectPlansError } = await auth.client
      .from("planeaciones")
      .select(
        "id,docente_id,cuatrimestre_id,asignatura_id,grupo,modalidad,estado,asignaturas!inner(nombre)",
      )
      .eq("docente_id", user.entidad_id)
      .eq("cuatrimestre_id", cuatrimestreId);
    if (subjectPlansError)
      return json(
        { error: "No fue posible verificar planeaciones existentes." },
        503,
      );
    const matchingPlans = (subjectPlans || []).filter(
      (plan: any) =>
        normalizePlanningSubjectName(plan.asignaturas?.nombre) === subjectKey,
    ) as any[];
    if (matchingPlans.length > 1) {
      return json(
        {
          error:
            "Existe un conflicto entre planeaciones de la misma asignatura; solicita revisión administrativa.",
          code: "planning_subject_scope_conflict",
        },
        409,
      );
    }
    if (planId) {
      const plan = matchingPlans[0];
      if (
        !plan ||
        plan.id !== planId ||
        plan.estado !== "Corrección" ||
        plan.docente_id !== user.entidad_id ||
        plan.cuatrimestre_id !== cuatrimestreId ||
        plan.asignatura_id !== asignaturaId ||
        plan.grupo !== grupo
      ) {
        return json(
          {
            error:
              "La planeación a reenviar no corresponde a tu carga del cuatrimestre.",
          },
          403,
        );
      }
    } else if (matchingPlans.length) {
      return json(
        {
          error:
            "Ya existe una planeación para esta asignatura y sus grupos cubiertos.",
          code: "planning_subject_scope_conflict",
        },
        409,
      );
    }

    const moderation = validarComentarioOpcional(
      typeof body.comentario === "string" ? body.comentario : null,
      500,
    );
    if (!moderation.valido)
      return json({ error: moderation.error, code: "comment_rejected" }, 400);

    const objectHead = await obtenerCabeceraArchivoR2(body.path);
    if (objectHead.status === "missing")
      return json(
        {
          error:
            "El archivo directo no se encontró. Intenta cargarlo de nuevo.",
          code: "planning_upload_object_missing",
        },
        409,
      );
    if (objectHead.status === "unavailable")
      return json(
        {
          error: "No fue posible verificar el archivo cargado.",
          code: "planning_upload_verification_unavailable",
        },
        503,
      );
    if (
      objectHead.contentLength !== body.file_size ||
      objectHead.contentType !== "application/pdf"
    ) {
      return json(
        {
          error: "El archivo cargado no coincide con sus metadatos PDF.",
          code: "planning_upload_object_invalid",
        },
        409,
      );
    }

    const datos = {
      asignatura_id: asignaturaId,
      grupo: group.clave,
      grupos_cubiertos: gruposCubiertos,
      modalidad: group.modalidad,
      proyecto: body.proyecto === true || body.proyecto === "true",
      laboratorio: typeof body.laboratorio === "string" ? body.laboratorio : "",
      visitas: typeof body.visitas === "string" ? body.visitas : "",
      url_pdf: obtenerUrlPublica(body.path),
      nombre_archivo: body.file_name,
      comentario_docente: moderation.valorNormalizado,
      campus: docente.campus || "",
      turno: docente.turno || "",
      estado: "Pendiente",
    };
    const { error: persistenceError } = planId
      ? await auth.client
          .from("planeaciones")
          .update(datos)
          .eq("id", planId)
          .eq("docente_id", user.entidad_id)
          .eq("cuatrimestre_id", cuatrimestreId)
      : await auth.client
          .from("planeaciones")
          .insert({
            ...datos,
            docente_id: user.entidad_id,
            cuatrimestre_id: cuatrimestreId,
            no_aplica_count: null,
          });
    if (persistenceError) {
      if (persistenceError.code === "23505")
        return json({ error: "Ya existe" }, 409);
      if (persistenceError.code === "42501")
        return json(
          {
            error: "La planeación fue rechazada por la validación de acceso.",
            code: "planning_persistence_rejected",
          },
          403,
        );
      console.error("[Planning direct upload] persistence failed", {
        code: persistenceError.code || "unknown",
      });
      return json(
        {
          error: "No fue posible guardar la planeación.",
          code: "planning_persistence_failed",
        },
        503,
      );
    }

    try {
      const { notificarCoordinadoresDocente } = await import(
        "../../../services/notificaciones"
      );
      await notificarCoordinadoresDocente(
        user.entidad_id,
        cuatrimestreId,
        "Planeación recibida/actualizada",
        `El docente ha ${planId ? "reenviado" : "subido"} una planeación.`,
        "/coordinador/planeaciones",
      );
    } catch (error) {
      console.error("[Planning direct upload] notification failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
    return json({ success: true }, 201);
  } catch (error) {
    console.error("[Planning direct upload] unexpected failure", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return json(
      { error: "Error interno", code: "planning_upload_unexpected" },
      500,
    );
  }
};
