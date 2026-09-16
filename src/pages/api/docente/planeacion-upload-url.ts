import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  R2_DIRECT_UPLOAD_EXPIRES_SECONDS,
  R2_DIRECT_UPLOAD_UNAVAILABLE,
  crearUrlSubidaR2Firmada,
  estaHabilitadoR2,
} from "../../../lib/storage";
import {
  buildPlanningPdfPath,
  parsePositiveInteger,
  requireTeacherPlanningSubmissionOpen,
  validatePlanningPdfMetadata,
} from "../../../lib/planningSubmissionWindow";

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Mints a short-lived, R2-only PUT capability for a server-owned planning path. */
export const POST: APIRoute = async ({ request, cookies }) => {
  let auth;
  try {
    auth = await requireRole(cookies, ["docente"]);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json(
      { error: "Error interno", code: "planning_upload_unexpected" },
      500,
    );
  }

  const body = await readJsonObject(request);
  const fileSize = typeof body?.file_size === "number" ? body.file_size : null;
  const cuatrimestreId = parsePositiveInteger(body?.cuatrimestre_id);
  const pdf = body
    ? validatePlanningPdfMetadata(body.file_name, body.content_type, fileSize)
    : { ok: false as const, error: "Solicitud de carga inválida." };
  if (!cuatrimestreId || !pdf.ok || fileSize === null) {
    return json({ error: pdf.ok ? "Cuatrimestre inválido." : pdf.error }, 400);
  }

  if (!estaHabilitadoR2()) {
    return json(
      {
        error: "La carga directa de archivos no está disponible temporalmente.",
        code: R2_DIRECT_UPLOAD_UNAVAILABLE,
      },
      503,
    );
  }

  try {
    const { data: user, error: userError } = await auth.client
      .from("usuarios")
      .select("entidad_id,rol")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (userError)
      return json(
        { error: "No fue posible verificar tu perfil docente." },
        503,
      );
    if (!user || user.rol !== "docente" || !user.entidad_id) {
      return json({ error: "Solo docentes" }, 403);
    }

    const denied = await requireTeacherPlanningSubmissionOpen(
      auth.client,
      cuatrimestreId,
    );
    if (denied) return denied;

    const path = buildPlanningPdfPath(cuatrimestreId, user.entidad_id);
    const uploadHeaders = {
      "Content-Type": "application/pdf",
      "If-None-Match": "*",
    };
    const uploadUrl = await crearUrlSubidaR2Firmada(path, "application/pdf");
    return json(
      {
        path,
        upload_url: uploadUrl,
        upload_headers: uploadHeaders,
        upload_expires_at: new Date(
          Date.now() + R2_DIRECT_UPLOAD_EXPIRES_SECONDS * 1000,
        ).toISOString(),
      },
      201,
    );
  } catch (error) {
    console.error("[Planning direct upload] unable to mint upload URL", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return json(
      {
        error: "La carga directa de archivos no está disponible temporalmente.",
        code: R2_DIRECT_UPLOAD_UNAVAILABLE,
      },
      503,
    );
  }
};
