import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { validarComentarioOpcional } from "../../../lib/moderation";
import { normalizePlanningSubjectName } from "../../../lib/planningSubjectScope";
import { isPlanningSubjectMarkedNp } from "../../../lib/planningSubjectStatus";
import {
  estaHabilitadoR2,
  r2UploadErrorCode,
  subirArchivo,
} from "../../../lib/storage";
import {
  buildPlanningPdfPath,
  parsePositiveInteger,
  requireTeacherPlanningSubmissionOpen,
  resolveTeacherPlanningGroup,
  validatePlanningPdf,
} from "../../../lib/planningSubmissionWindow";

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ["docente"]);
    cl = auth.client;
    userId = auth.user.id;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }

  try {
    const { data: u } = await cl
      .from("usuarios")
      .select("entidad_id,rol")
      .eq("id", userId)
      .maybeSingle();
    if (!u || u.rol !== "docente" || !u.entidad_id)
      return new Response(JSON.stringify({ error: "Solo docentes" }), {
        status: 403,
      });
    const { data: docente } = await cl
      .from("docentes")
      .select("campus,turno")
      .eq("id", u.entidad_id)
      .maybeSingle();
    if (!docente)
      return new Response(
        JSON.stringify({ error: "No fue posible verificar tu perfil docente" }),
        { status: 403 },
      );

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File))
      return new Response(
        JSON.stringify({ error: "Archivo requerido o inválido" }),
        { status: 400 },
      );
    const modalidad = formData.get("modalidad") as string;
    if (modalidad && modalidad !== "Escolarizado")
      return new Response(
        JSON.stringify({
          error: "Solo se aceptan planeaciones en modalidad Escolarizado",
        }),
        { status: 400 },
      );

    const cuatrimestreId = parsePositiveInteger(
      formData.get("cuatrimestre_id"),
    );
    const asignaturaId = parsePositiveInteger(formData.get("asignatura_id"));
    const grupo = String(formData.get("grupo") || "").trim();
    if (!cuatrimestreId || !asignaturaId || !grupo)
      return new Response(
        JSON.stringify({ error: "Asignatura, grupo o cuatrimestre inválido" }),
        { status: 400 },
      );
    const accessDenied = await requireTeacherPlanningSubmissionOpen(
      cl,
      cuatrimestreId,
    );
    if (accessDenied) return accessDenied;
    const pdfValidation = validatePlanningPdf(file);
    if (!pdfValidation.ok)
      return new Response(JSON.stringify({ error: pdfValidation.error }), {
        status: 400,
      });

    const group = await resolveTeacherPlanningGroup(
      cl,
      u.entidad_id,
      cuatrimestreId,
      asignaturaId,
      grupo,
    );
    if (!group)
      return new Response(
        JSON.stringify({
          error:
            "La asignatura y el grupo no corresponden a tu carga escolarizada del cuatrimestre.",
        }),
        { status: 403 },
      );

    // Resolve coverage on the server; browser-provided coverage is checked only
    // for staleness and never becomes the source of truth.
    const { data: assignedGroups, error: assignedGroupsError } = await cl
      .from("grupos")
      .select("id,clave,asignatura_id,modalidad,asignaturas!inner(nombre)")
      .eq("docente_id", u.entidad_id)
      .eq("cuatrimestre_id", cuatrimestreId)
      .eq("activo", true)
      .eq("modalidad", "Escolarizado");
    if (assignedGroupsError)
      return new Response(
        JSON.stringify({
          error: "No fue posible validar los grupos cubiertos.",
        }),
        { status: 503 },
      );
    const selectedAssignment = (assignedGroups || []).find(
      (item: any) =>
        item.asignatura_id === asignaturaId && item.clave === group.clave,
    ) as any;
    const subjectKey = normalizePlanningSubjectName(
      selectedAssignment?.asignaturas?.nombre,
    );
    if (!subjectKey)
      return new Response(
        JSON.stringify({
          error: "No fue posible identificar la asignatura seleccionada.",
        }),
        { status: 403 },
      );
    const { data: npRecords, error: npError } = await cl
      .from("planning_subject_np")
      .select("subject_key,estado")
      .eq("docente_id", u.entidad_id)
      .eq("cuatrimestre_id", cuatrimestreId);
    if (npError)
      return new Response(
        JSON.stringify({
          error:
            "No fue posible verificar el estado administrativo de la asignatura.",
          code: "planning_subject_status_unavailable",
        }),
        { status: 503 },
      );
    if (
      isPlanningSubjectMarkedNp(
        selectedAssignment?.asignaturas?.nombre,
        (npRecords || []) as any[],
      )
    )
      return new Response(
        JSON.stringify({
          error:
            "Esta asignatura fue marcada como no presentada por administración y no admite cargas hasta que sea reactivada.",
          code: "planning_subject_marked_np",
        }),
        { status: 409 },
      );
    const coveredAssignments = (assignedGroups || []).filter(
      (item: any) =>
        normalizePlanningSubjectName(item.asignaturas?.nombre) === subjectKey,
    ) as any[];
    const gruposCubiertos = [
      ...new Set(coveredAssignments.map((item) => String(item.clave))),
    ].sort();
    let requestedGroups: string[];
    try {
      const parsed = JSON.parse(String(formData.get("grupos_cubiertos") || ""));
      requestedGroups = Array.isArray(parsed)
        ? [
            ...new Set(
              parsed
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean),
            ),
          ].sort()
        : [];
    } catch {
      requestedGroups = [];
    }
    if (
      !requestedGroups.length ||
      requestedGroups.length !== gruposCubiertos.length ||
      requestedGroups.some((item, index) => item !== gruposCubiertos[index])
    )
      return new Response(
        JSON.stringify({
          error:
            "Los grupos cubiertos ya no coinciden con tu carga; actualiza la página.",
          code: "planning_subject_scope_conflict",
        }),
        { status: 409 },
      );

    // Never merge legacy duplicate rows: an administrator must resolve that
    // ambiguity before a new upload or correction can change any record.
    const { data: subjectPlans, error: subjectPlansError } = await cl
      .from("planeaciones")
      .select(
        "id,docente_id,cuatrimestre_id,asignatura_id,grupo,modalidad,estado,asignaturas!inner(nombre)",
      )
      .eq("docente_id", u.entidad_id)
      .eq("cuatrimestre_id", cuatrimestreId);
    if (subjectPlansError)
      return new Response(
        JSON.stringify({
          error: "No fue posible verificar planeaciones existentes.",
        }),
        { status: 503 },
      );
    const matchingPlans = (subjectPlans || []).filter(
      (plan: any) =>
        normalizePlanningSubjectName(plan.asignaturas?.nombre) === subjectKey,
    ) as any[];
    const planId = parsePositiveInteger(formData.get("plan_id"));
    if (matchingPlans.length > 1)
      return new Response(
        JSON.stringify({
          error:
            "Existe un conflicto entre planeaciones de la misma asignatura; solicita revisión administrativa.",
          code: "planning_subject_scope_conflict",
        }),
        { status: 409 },
      );
    if (planId) {
      const plan = matchingPlans[0];
      if (
        !plan ||
        plan.id !== planId ||
        plan.estado !== "Corrección" ||
        plan.docente_id !== u.entidad_id ||
        plan.cuatrimestre_id !== cuatrimestreId ||
        plan.asignatura_id !== asignaturaId ||
        plan.grupo !== grupo
      )
        return new Response(
          JSON.stringify({
            error:
              "La planeación a reenviar no corresponde a tu carga del cuatrimestre.",
          }),
          { status: 403 },
        );
    } else if (matchingPlans.length) {
      return new Response(
        JSON.stringify({
          error:
            "Ya existe una planeación para esta asignatura y sus grupos cubiertos.",
          code: "planning_subject_scope_conflict",
        }),
        { status: 409 },
      );
    }

    const comentarioRaw = formData.get("comentario") as string | null;
    const moderacion = validarComentarioOpcional(comentarioRaw, 500);
    if (!moderacion.valido)
      return new Response(
        JSON.stringify({ error: moderacion.error, code: "comment_rejected" }),
        { status: 400 },
      );
    const path = buildPlanningPdfPath(cuatrimestreId, u.entidad_id);
    const buffer = await file.arrayBuffer();

    let pdfUrl: string;
    if (estaHabilitadoR2()) {
      try {
        const { url } = await subirArchivo(
          path,
          buffer,
          file.type || "application/pdf",
        );
        pdfUrl = url;
      } catch (error) {
        console.error("[Subir] R2 upload failed", {
          code: r2UploadErrorCode(error),
        });
        return new Response(
          JSON.stringify({
            error: "No fue posible almacenar el PDF.",
            code: "storage_upload_failed",
          }),
          { status: 503 },
        );
      }
    } else {
      const { error: upErr } = await cl.storage
        .from("planeaciones")
        .upload(path, buffer, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });
      if (upErr) {
        console.error("[Subir] Supabase storage upload failed");
        return new Response(
          JSON.stringify({
            error: "No fue posible almacenar el PDF.",
            code: "storage_upload_failed",
          }),
          { status: 503 },
        );
      }
      const { data: urlData } = cl.storage
        .from("planeaciones")
        .getPublicUrl(path);
      pdfUrl = urlData.publicUrl;
    }

    const datos = {
      asignatura_id: asignaturaId,
      grupo: group.clave,
      grupos_cubiertos: gruposCubiertos,
      modalidad: group.modalidad,
      proyecto: formData.get("proyecto") === "true",
      laboratorio: formData.get("laboratorio") as string,
      visitas: formData.get("visitas") as string,
      url_pdf: pdfUrl,
      nombre_archivo: file.name,
      comentario_docente: moderacion.valorNormalizado,
      campus: docente.campus || "",
      turno: docente.turno || "",
      estado: "Pendiente",
    };

    let dbErr = null;
    if (planId) {
      const { error } = await cl
        .from("planeaciones")
        .update(datos)
        .eq("id", planId)
        .eq("docente_id", u.entidad_id)
        .eq("cuatrimestre_id", cuatrimestreId);
      dbErr = error;
    } else {
      const { error } = await cl.from("planeaciones").insert({
        ...datos,
        docente_id: u.entidad_id,
        cuatrimestre_id: cuatrimestreId,
        no_aplica_count: null,
      });
      dbErr = error;
    }

    if (dbErr) {
      if (dbErr.code === "23505")
        return new Response(JSON.stringify({ error: "Ya existe" }), {
          status: 409,
        });
      if (dbErr.code === "42501")
        return new Response(
          JSON.stringify({
            error: "La planeación fue rechazada por la validación de acceso.",
            code: "planning_persistence_rejected",
          }),
          { status: 403 },
        );
      console.error("[Subir] Planning persistence failed", {
        code: dbErr.code || "unknown",
      });
      return new Response(
        JSON.stringify({
          error: "No fue posible guardar la planeación.",
          code: "planning_persistence_failed",
        }),
        { status: 503 },
      );
    }

    try {
      const { notificarCoordinadoresDocente } = await import(
        "../../../services/notificaciones"
      );
      await notificarCoordinadoresDocente(
        u.entidad_id,
        cuatrimestreId,
        "Planeación recibida/actualizada",
        `El docente ha ${planId ? "reenviado" : "subido"} una planeación.`,
        "/coordinador/planeaciones",
      );
    } catch (notifyErr) {
      console.error("[Subir] Error notificando coordinadores:", notifyErr);
    }

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch {
    return new Response(
      JSON.stringify({
        error: "Error interno",
        code: "planning_upload_unexpected",
      }),
      { status: 500 },
    );
  }
};
