import type { APIRoute } from "astro";

/**
 * Retired teacher-planning upload route. Use /api/docente/subir-archivo.
 */
export const POST: APIRoute = () =>
  new Response(
    JSON.stringify({
      error:
        "Este endpoint de planeación fue retirado. Usa /api/docente/subir-archivo.",
      code: "planning_endpoint_retired",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
