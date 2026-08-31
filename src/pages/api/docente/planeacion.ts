import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  parsePositiveInteger,
  requireTeacherPlanningSubmissionOpen,
  resolveTeacherPlanningGroup,
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
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
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

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Datos de planeación inválidos" }), { status: 400 });
    }
    const planning = body as Record<string, unknown>;
    const cuatrimestreId = parsePositiveInteger(planning.cuatrimestre_id);
    const asignaturaId = parsePositiveInteger(planning.asignatura_id);
    const grupo = typeof planning.grupo === "string" ? planning.grupo.trim() : "";
    if (!cuatrimestreId || !asignaturaId || !grupo) {
      return new Response(JSON.stringify({ error: "Asignatura, grupo o cuatrimestre inválido" }), { status: 400 });
    }
    const accessDenied = await requireTeacherPlanningSubmissionOpen(cl, cuatrimestreId);
    if (accessDenied) return accessDenied;
    const group = await resolveTeacherPlanningGroup(cl, u.entidad_id, cuatrimestreId, asignaturaId, grupo);
    if (!group) {
      return new Response(JSON.stringify({ error: "La asignatura y el grupo no corresponden a tu carga escolarizada del cuatrimestre." }), { status: 403 });
    }
    // This legacy JSON endpoint cannot safely receive a storage reference.
    // PDFs must go through an upload endpoint that generates the object path.
    return new Response(JSON.stringify({ error: "La planeación debe enviarse con un archivo PDF mediante el formulario de carga." }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
