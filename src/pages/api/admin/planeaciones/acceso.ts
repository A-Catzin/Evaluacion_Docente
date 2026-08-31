import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../../lib/auth";
import { parsePlanningWindowInput } from "../../../../lib/planningSubmissionWindow";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
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
    const body = await request.json();
    const parsed = parsePlanningWindowInput(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { error } = await client.rpc("planning_submission_window_save", {
      p_cuatrimestre_id: parsed.value.cuatrimestreId,
      p_mode: parsed.value.mode,
      p_opens_at: parsed.value.opensAt,
      p_closes_at: parsed.value.closesAt,
    });
    if (error) return json({ error: "No fue posible guardar la configuración de acceso." }, 400);
    return json({ success: true });
  } catch {
    return json({ error: "Error interno" }, 500);
  }
};
