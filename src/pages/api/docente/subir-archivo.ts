import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { validarComentarioOpcional } from "../../../lib/moderation";
import { estaHabilitadoR2, subirArchivo } from "../../../lib/storage";

const BUCKET_PLANEACIONES = "planeaciones";

export const POST: APIRoute = async ({ request, cookies }) => {
  console.log("[Subir] Inicio");
  try {
    const t = cookies.get("sb-access-token")?.value;
    const r = cookies.get("sb-refresh-token")?.value;
    if (!t || !r)
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
      });

    const cl = db();
    const { data: s } = await cl.auth.setSession({
      access_token: t,
      refresh_token: r,
    });
    if (!s.user)
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401,
      });
    const { data: u } = await cl
      .from("usuarios")
      .select("entidad_id,rol")
      .eq("id", s.user.id)
      .maybeSingle();
    if (!u || u.rol !== "docente" || !u.entidad_id)
      return new Response(JSON.stringify({ error: "Solo docentes" }), {
        status: 403,
      });

    const formData = await request.formData();
    const path = formData.get("path") as string;
    const file = formData.get("file") as File;

    console.log("[Subir] path:", path, "file:", file?.name, file?.size);
    if (!file || !path)
      return new Response(JSON.stringify({ error: "Faltan archivo o ruta" }), {
        status: 400,
      });

    const modalidad = formData.get("modalidad") as string;
    if (modalidad && modalidad !== "Escolarizada")
      return new Response(
        JSON.stringify({
          error: "Solo se aceptan planeaciones en modalidad Escolarizada",
        }),
        { status: 400 },
      );

    const buffer = await file.arrayBuffer();

    let pdfUrl: string;
    if (estaHabilitadoR2()) {
      const { url } = await subirArchivo(
        BUCKET_PLANEACIONES,
        path,
        buffer,
        file.type || "application/pdf",
      );
      pdfUrl = url;
    } else {
      const { error: upErr } = await cl.storage
        .from("planeaciones")
        .upload(path, buffer, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });
      if (upErr) {
        console.error("[Subir] Storage:", upErr);
        return new Response(
          JSON.stringify({ error: "Error Storage: " + upErr.message }),
          { status: 400 },
        );
      }
      const { data: urlData } = cl.storage
        .from("planeaciones")
        .getPublicUrl(path);
      pdfUrl = urlData.publicUrl;
    }

    const planId = formData.get("plan_id") as string;

    const comentarioRaw = formData.get("comentario") as string | null;
    const moderacion = validarComentarioOpcional(comentarioRaw, 500);
    if (!moderacion.valido) {
      return new Response(
        JSON.stringify({ error: moderacion.error, code: "comment_rejected" }),
        { status: 400 },
      );
    }

    const datos = {
      asignatura_id: parseInt(formData.get("asignatura_id") as string) || null,
      grupo: formData.get("grupo") as string,
      modalidad: modalidad,
      proyecto: formData.get("proyecto") === "true",
      laboratorio: formData.get("laboratorio") as string,
      visitas: formData.get("visitas") as string,
      url_pdf: pdfUrl,
      nombre_archivo: (formData.get("nombre") as string) || file.name,
      comentario_docente: moderacion.valorNormalizado,
      campus: formData.get("campus") as string,
      turno: formData.get("turno") as string,
      estado: planId ? "Pendiente" : undefined,
    };

    let dbErr = null;
    const cuatrimestreId = parseInt(formData.get("cuatrimestre_id") as string);
    if (planId) {
      // Reenviar correccion: actualizar existente
      const { error } = await cl
        .from("planeaciones")
        .update(datos)
        .eq("id", parseInt(planId));
      dbErr = error;
    } else {
      const { error } = await cl.from("planeaciones").insert({
        ...datos,
        docente_id: u.entidad_id,
        cuatrimestre_id: cuatrimestreId,
      });
      dbErr = error;
    }

    if (dbErr) {
      console.error("[Subir] DB:", dbErr);
      if (dbErr.code === "23505")
        return new Response(JSON.stringify({ error: "Ya existe" }), {
          status: 409,
        });
      return new Response(
        JSON.stringify({ error: "Error BD: " + dbErr.message }),
        { status: 400 },
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
  } catch (err) {
    console.error("[Subir] Catch:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
