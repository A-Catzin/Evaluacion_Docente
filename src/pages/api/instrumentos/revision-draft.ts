import type { APIRoute } from "astro";
import { z } from "zod";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
  validarCamposDeTextoLibreConLimites,
} from "../../../lib/moderation";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 100_000;
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const identity = z.object({
  docente_id: z.number().int().positive().safe(),
  cuatrimestre_id: z.number().int().positive().safe(),
  version_id: z.string().uuid(),
}).strict();
const operation = identity.extend({
  supersedes_submission_id: z.string().uuid(),
  operation_id: z.string().uuid(),
}).strict();
const draft = z.object({
  asignatura_id: z.number().int().positive().safe().nullable().optional(),
  grupo: z.string().max(120).nullable().optional(),
  answers: z.array(z.object({
    item_id: z.string().uuid(),
    value: z.union([z.number().int().min(1).max(3), z.literal("na")]),
    na_reason: z.string().max(MAX_NOTA_SECCION_LONGITUD).nullable().optional(),
  }).strict().refine((answer) => answer.value === "na" || !answer.na_reason?.trim(), {
    path: ["na_reason"], message: "Un valor numérico no admite motivo N/A",
  })).max(100).optional(),
  evidence: z.array(z.object({
    section_id: z.string().uuid(), evidence: z.string().max(MAX_NOTA_SECCION_LONGITUD),
  }).strict()).max(20).optional(),
  metadata: z.object({
    strengths: z.string().max(MAX_COMENTARIO_LONGITUD).nullable().optional(),
    priority_area: z.string().max(MAX_COMENTARIO_LONGITUD).nullable().optional(),
    recommendation: z.string().max(MAX_COMENTARIO_LONGITUD).nullable().optional(),
    general_observations: z.string().max(MAX_COMENTARIO_LONGITUD).nullable().optional(),
  }).strict().optional(),
}).strict();
const save = operation.extend({ draft });
const queryInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().safe());
const queryIdentity = z.object({
  docente_id: queryInteger,
  cuatrimestre_id: queryInteger,
  version_id: z.string().uuid(),
}).strict();

function invalid(error?: z.ZodError) {
  return json({ error: "Datos del borrador no válidos", ...(error ? { detalles: formatZodFieldErrors(error) } : {}) }, 400);
}
function rpcFailure(error: { code?: string }) {
  return json({ error: "No fue posible procesar el borrador" },
    error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500);
}
async function readBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}
async function authorize(cookies: Parameters<typeof requireRole>[0]) {
  return requireRole(cookies, ["superadmin", "coordinador", "observador"]);
}
function rpcIdentity(value: z.infer<typeof identity>) {
  return { p_docente_id: value.docente_id, p_cuatrimestre_id: value.cuatrimestre_id, p_version_id: value.version_id };
}
function rpcOperation(value: z.infer<typeof operation>) {
  return { ...rpcIdentity(value), p_supersedes_submission_id: value.supersedes_submission_id, p_operation_id: value.operation_id };
}

export const GET: APIRoute = async ({ request, cookies }) => {
  let client;
  try { ({ client } = await authorize(cookies)); }
  catch (error) { return error instanceof AuthError ? error.response : json({ error: "Error interno" }, 500); }
  try {
    const entries = [...new URL(request.url).searchParams.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return invalid();
    const parsed = queryIdentity.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return invalid(parsed.error);
    const { data, error } = await client.rpc("get_observation_revision_state", rpcIdentity(parsed.data));
    if (error) return rpcFailure(error);
    return json({ state: data });
  } catch { return json({ error: "Error interno" }, 500); }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  let client;
  try { ({ client } = await authorize(cookies)); }
  catch (error) { return error instanceof AuthError ? error.response : json({ error: "Error interno" }, 500); }
  try {
    const parsed = save.safeParse(await readBody(request));
    if (!parsed.success) return invalid(parsed.error);
    const value = parsed.data;
    const texts = Object.fromEntries([
      ...(value.draft.evidence ?? []).map((entry, index) => [`evidence_${index}`, entry.evidence]),
      ...(value.draft.answers ?? []).filter((entry) => entry.value === "na")
        .map((entry, index) => [`na_reason_${index}`, entry.na_reason]),
      ...Object.entries(value.draft.metadata ?? {}),
    ]);
    const limits = Object.fromEntries([
      ...(value.draft.evidence ?? []).map((_, index) => [`evidence_${index}`, MAX_NOTA_SECCION_LONGITUD]),
      ...(value.draft.answers ?? []).filter((entry) => entry.value === "na")
        .map((_, index) => [`na_reason_${index}`, MAX_NOTA_SECCION_LONGITUD]),
      ...["strengths", "priority_area", "recommendation", "general_observations"]
        .map((key) => [key, MAX_COMENTARIO_LONGITUD]),
    ]);
    const moderation = validarCamposDeTextoLibreConLimites(texts, limits);
    if (!moderation.valido) return json({ error: moderation.error || "Texto no permitido", code: "comment_rejected" }, 400);
    const { data, error } = await client.rpc("save_observation_revision_draft", {
      ...rpcOperation(value), p_draft: value.draft,
    });
    if (error) return rpcFailure(error);
    return json({ success: true, completed: (data as { completed?: boolean } | null)?.completed === true, draft: data });
  } catch { return json({ error: "Error interno" }, 500); }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  let client;
  try { ({ client } = await authorize(cookies)); }
  catch (error) { return error instanceof AuthError ? error.response : json({ error: "Error interno" }, 500); }
  try {
    const parsed = operation.safeParse(await readBody(request));
    if (!parsed.success) return invalid(parsed.error);
    const { error } = await client.rpc("delete_observation_revision_draft", rpcOperation(parsed.data));
    if (error) return rpcFailure(error);
    return json({ success: true });
  } catch { return json({ error: "Error interno" }, 500); }
};
