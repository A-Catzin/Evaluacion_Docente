import type { APIRoute } from "astro";
import { z } from "zod";
import { AuthError, requireRole } from "../../../lib/auth";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import { MAX_INSTRUMENT_TEXT_LENGTH } from "../../../lib/validation/instrumentLimits";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const MAX_DRAFT_BYTES = 100_000;

const DraftIdentitySchema = z
  .object({
    docente_id: z.coerce.number().int().positive(),
    cuatrimestre_id: z.coerce.number().int().positive(),
    version_id: z.string().uuid(),
    purpose: z.enum(["observation", "coordination"]).optional(),
  })
  .strict();

const rpcName = (action: "get" | "save" | "delete", purpose?: string) =>
  `${action}_${purpose === "coordination" ? "coordination" : "observation"}_instrument_draft`;

const DraftSchema = z
  .object({
    asignatura_id: z.number().int().positive().nullable().optional(),
    grupo: z.string().max(120).nullable().optional(),
    answers: z
      .array(
        z
          .object({
            item_id: z.string().uuid(),
            value: z.union([z.number().int().min(1).max(5), z.literal("na")]),
            na_reason: z
              .string()
              .max(MAX_INSTRUMENT_TEXT_LENGTH)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    evidence: z
      .array(
        z
          .object({
            section_id: z.string().uuid(),
            evidence: z.string().max(MAX_INSTRUMENT_TEXT_LENGTH),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    checks: z
      .array(
        z
          .object({
            check_id: z.string().uuid(),
            value: z.enum(["complies", "does_not_comply", "na"]),
            na_reason: z
              .string()
              .max(MAX_INSTRUMENT_TEXT_LENGTH)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    metadata: z
      .object({
        strengths: z
          .string()
          .max(MAX_INSTRUMENT_TEXT_LENGTH)
          .nullable()
          .optional(),
        priority_area: z
          .string()
          .max(MAX_INSTRUMENT_TEXT_LENGTH)
          .nullable()
          .optional(),
        recommendation: z
          .string()
          .max(MAX_INSTRUMENT_TEXT_LENGTH)
          .nullable()
          .optional(),
        general_observations: z
          .string()
          .max(MAX_INSTRUMENT_TEXT_LENGTH)
          .nullable()
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export const SaveDraftSchema = DraftIdentitySchema.extend({
  draft: DraftSchema,
}).strict();

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function validationError(error: z.ZodError) {
  return json(
    {
      error: "Datos del borrador no válidos",
      detalles: formatZodFieldErrors(error),
    },
    400,
  );
}

function parseQuery(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const entries = Array.from(params.entries());
    if (new Set(entries.map(([key]) => key)).size !== entries.length)
      return null;
    return DraftIdentitySchema.safeParse(Object.fromEntries(entries));
  } catch {
    return null;
  }
}

async function parseJson(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DRAFT_BYTES)
      return null;
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function authorize(cookies: Parameters<typeof requireRole>[0]) {
  return requireRole(cookies, ["superadmin", "coordinador", "observador"]);
}

function rpcError(error: { code?: string; message?: string }) {
  return json(
    { error: error.message || "No fue posible procesar el borrador." },
    error.code === "42501" ? 403 : 400,
  );
}

export const GET: APIRoute = async ({ request, cookies }) => {
  let auth;
  try {
    auth = await authorize(cookies);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "Error interno" }, 500);
  }

  try {
    const parsed = parseQuery(request);
    if (!parsed || !parsed.success) {
      return parsed
        ? validationError(parsed.error)
        : json({ error: "Datos del borrador no válidos" }, 400);
    }
    const { data, error } = await auth.client.rpc(
      rpcName("get", parsed.data.purpose),
      {
        p_docente_id: parsed.data.docente_id,
        p_cuatrimestre_id: parsed.data.cuatrimestre_id,
        p_version_id: parsed.data.version_id,
      },
    );
    if (error) return rpcError(error);
    return json({ draft: data });
  } catch {
    return json({ error: "Error interno" }, 500);
  }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  let auth;
  try {
    auth = await authorize(cookies);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "Error interno" }, 500);
  }

  try {
    const body = await parseJson(request);
    if (body === null)
      return json({ error: "Datos del borrador no válidos" }, 400);
    const parsed = SaveDraftSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { data, error } = await auth.client.rpc(
      rpcName("save", parsed.data.purpose),
      {
        p_docente_id: parsed.data.docente_id,
        p_cuatrimestre_id: parsed.data.cuatrimestre_id,
        p_version_id: parsed.data.version_id,
        p_draft: parsed.data.draft,
      },
    );
    if (error) return rpcError(error);
    const completed =
      (data as { completed?: boolean } | null)?.completed === true;
    return json({ success: true, completed, draft: data });
  } catch {
    return json({ error: "Error interno" }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  let auth;
  try {
    auth = await authorize(cookies);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: "Error interno" }, 500);
  }

  try {
    const body = await parseJson(request);
    if (body === null)
      return json({ error: "Datos del borrador no válidos" }, 400);
    const parsed = DraftIdentitySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { error } = await auth.client.rpc(
      rpcName("delete", parsed.data.purpose),
      {
        p_docente_id: parsed.data.docente_id,
        p_cuatrimestre_id: parsed.data.cuatrimestre_id,
        p_version_id: parsed.data.version_id,
      },
    );
    if (error) return rpcError(error);
    return json({ success: true });
  } catch {
    return json({ error: "Error interno" }, 500);
  }
};
