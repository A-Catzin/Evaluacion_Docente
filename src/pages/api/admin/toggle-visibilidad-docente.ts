import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { ToggleVisibilidadSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get("sb-access-token")?.value;
  const r = cookies.get("sb-refresh-token")?.value;
  if (!t || !r)
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
    });
  try {
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
      .select("rol")
      .eq("id", s.user.id)
      .maybeSingle();
    if (!u || u.rol !== "superadmin")
      return new Response(JSON.stringify({ error: "Solo superadmin" }), {
        status: 403,
      });

    const body = await request.json();
    const parseResult = ToggleVisibilidadSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Datos inválidos",
          detalles: formatZodFieldErrors(parseResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { docente_id, visible } = parseResult.data;

    const { error } = await cl
      .from("docentes")
      .update({ visible_dashboard: visible })
      .eq("id", docente_id);
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
