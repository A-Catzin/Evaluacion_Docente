import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../../lib/auth";
import { diagnosticarR2 } from "../../../../lib/storage";
import { MAX_PLANNING_PDF_BYTES } from "../../../../lib/planningSubmissionWindow";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({ cookies }) => {
  try {
    await requireRole(cookies, ["superadmin"]);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "No fue posible verificar el acceso.", code: "diagnostic_auth_failed" }, 502);
  }

  const r2 = await diagnosticarR2();
  return json({
    database: { code: "db_auth_ok" },
    upload: {
      code: "vercel_multipart_safe_limit",
      maxPdfBytes: MAX_PLANNING_PDF_BYTES,
    },
    r2,
  });
};
