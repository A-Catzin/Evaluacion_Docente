import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { marcarLeida } from "../../../services/notificaciones";

const ROLES_AUTENTICADOS = [
  "superadmin",
  "coordinador",
  "docente",
  "estudiante",
  "observador",
  "pendiente",
];

export const POST: APIRoute = async ({ params, cookies }) => {
  try {
    await requireRole(cookies, ROLES_AUTENTICADOS);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }

  const id = parseInt(params.id || "0");
  if (!id)
    return new Response(JSON.stringify({ error: "ID inválido" }), {
      status: 400,
    });
  try {
    await marcarLeida(id);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
