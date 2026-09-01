import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { validarComentarioOpcional } from "../../../lib/moderation";
import { estaHabilitadoR2, r2UploadErrorCode, subirArchivo } from "../../../lib/storage";
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
        {
          status: 400,
        },
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

    const planId = parsePositiveInteger(formData.get("plan_id"));
    if (planId) {
      const { data } = await cl
        .from("planeaciones")
        .select(
          "docente_id,cuatrimestre_id,asignatura_id,grupo,modalidad,estado",
        )
        .eq("id", planId)
        .maybeSingle();
      const plan = data as {
        docente_id: number;
        cuatrimestre_id: number;
        asignatura_id: number;
        grupo: string;
        modalidad: string;
        estado: string;
      } | null;
      if (
        !plan ||
        plan.estado !== "Corrección" ||
        plan.docente_id !== u.entidad_id ||
        plan.cuatrimestre_id !== cuatrimestreId ||
        plan.asignatura_id !== asignaturaId ||
        plan.grupo !== grupo
      ) {
        return new Response(
          JSON.stringify({
            error:
              "La planeación a reenviar no corresponde a tu carga del cuatrimestre.",
          }),
          { status: 403 },
        );
      }
    }
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
        console.error("[Subir] R2 upload failed", { code: r2UploadErrorCode(error) });
        return new Response(
          JSON.stringify({ error: "No fue posible almacenar el PDF.", code: "storage_upload_failed" }),
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
          JSON.stringify({ error: "No fue posible almacenar el PDF.", code: "storage_upload_failed" }),
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
      // Reenviar correccion: actualizar existente
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
          JSON.stringify({ error: "La planeación fue rechazada por la validación de acceso.", code: "planning_persistence_rejected" }),
          { status: 403 },
        );
      console.error("[Subir] Planning persistence failed", { code: dbErr.code || "unknown" });
      return new Response(
        JSON.stringify({ error: "No fue posible guardar la planeación.", code: "planning_persistence_failed" }),
        { status: 503 },
      );
    }

    // Notificar a coordinadores del docente
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
    return new Response(JSON.stringify({ error: "Error interno", code: "planning_upload_unexpected" }), {
      status: 500,
    });
  }
};
