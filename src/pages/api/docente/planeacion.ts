import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

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
    const cuatrimestreId = body.cuatrimestre_id;
    const { data, error } = await cl
      .from("planeaciones")
      .insert({ ...body, docente_id: u.entidad_id })
      .select()
      .single();
    if (error) {
      if (error.code === "23505")
        return new Response(
          JSON.stringify({
            error: "Ya subiste una planeación para esta asignatura",
          }),
          { status: 409 },
        );
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });
    }

    try {
      if (typeof cuatrimestreId === "number") {
        await recalcularCalificacionDocente(cl, u.entidad_id, cuatrimestreId);
      }
    } catch (recalcError) {
      logRecalcError(u.entidad_id, cuatrimestreId as number, recalcError);
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 201,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
