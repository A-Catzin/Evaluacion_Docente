import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validCycle(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ["superadmin"]));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "Error interno" }, 500);
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const cycleId = body.cuatrimestre_id;
    if (!validCycle(cycleId)) return json({ error: "Cuatrimestre inválido" }, 400);

    if (body.action === "save_preferences") {
      if (!Array.isArray(body.preferences) || body.preferences.length > 250) {
        return json({ error: "Configuración de evaluadores inválida" }, 400);
      }
      const { data, error } = await client.rpc("save_observation_allocation_preferences", {
        p_cuatrimestre_id: cycleId,
        p_preferences: body.preferences,
      });
      if (error) return json({ error: "No fue posible guardar la configuración de evaluadores" }, 400);
      return json({ success: true, count: data });
    }

    if (body.action === "preview") {
      const { data, error } = await client.rpc("preview_observation_allocation", {
        p_cuatrimestre_id: cycleId,
      });
      if (error) return json({ error: "No fue posible generar la vista previa" }, 400);
      return json({ success: true, preview: data });
    }

    if (body.action === "confirm") {
      if (typeof body.preview_id !== "string" || typeof body.fingerprint !== "string"
        || !uuidPattern.test(body.preview_id) || !uuidPattern.test(body.fingerprint)) {
        return json({ error: "Confirmación de asignación inválida" }, 400);
      }
      const { data, error } = await client.rpc("confirm_observation_allocation", {
        p_cuatrimestre_id: cycleId,
        p_preview_id: body.preview_id,
        p_fingerprint: body.fingerprint,
      });
      if (error) return json({ error: "La vista previa venció o cambió; genera una nueva" }, 409);
      return json({ success: true, result: data });
    }

    return json({ error: "Acción inválida" }, 400);
  } catch {
    return json({ error: "Error interno" }, 500);
  }
};
