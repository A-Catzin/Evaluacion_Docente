import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import {
  MAX_COMENTARIO_LONGITUD,
  validarComentarioOpcional,
} from "../../../lib/moderation";
import { requireTeacherAutodiagnosticoSubmissionOpen } from "../../../lib/autodiagnosticoSubmissionWindow";
import { AutodiagnosticoSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import { recalcularCalificacionDocente } from "../../../services/calificaciones";

const AUTODIAGNOSTICO_PAYLOAD_KEYS = [
  "cuatrimestre_id",
  "nombre",
  "apellido_paterno",
  "apellido_materno",
  "campus",
  "oferta_academica",
  "turno",
  "modalidad",
  "reactivos",
  "comentarios",
] as const;

type DiagnosticStage =
  | "auth"
  | "usuario_lookup"
  | "json_parse"
  | "payload_validation"
  | "window_state"
  | "comment_moderation"
  | "docente_update"
  | "docente_create"
  | "docente_link"
  | "duplicate_check"
  | "insert"
  | "recalculation"
  | "unexpected";

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
};

function redactDiagnosticText(value: string, fallback: string) {
  const redacted = value
    .replace(
      /\b(?:bearer\s+|(?:access[_-]?)?token|authorization|cookie|password|secret|api[_-]?key)\s*(?:[:=]\s*)?[^\s,;]+/gi,
      "[redacted-secret]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /\([^)]{1,160}\)\s*=\s*\([^)]{1,240}\)/g,
      "([redacted-db-context])",
    )
    .replace(/(["'`])[^"'`]{1,160}\1/g, "$1[redacted]$1")
    .replace(/\s+/g, " ")
    .trim();
  return (redacted || fallback).slice(0, 240);
}

function serializeSafeError(error: unknown) {
  const candidate =
    error && typeof error === "object"
      ? (error as ErrorLike)
      : ({} as ErrorLike);
  return {
    name:
      typeof candidate.name === "string"
        ? redactDiagnosticText(candidate.name, "Error")
        : "Error",
    message:
      typeof candidate.message === "string"
        ? redactDiagnosticText(candidate.message, "Error no serializable")
        : "Error no serializable",
    status:
      typeof candidate.status === "number" && Number.isFinite(candidate.status)
        ? candidate.status
        : null,
    code:
      typeof candidate.code === "string" || typeof candidate.code === "number"
        ? redactDiagnosticText(String(candidate.code), "unknown")
        : null,
  };
}

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function payloadSummary(body: unknown) {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const payloadKeyNames = record
    ? AUTODIAGNOSTICO_PAYLOAD_KEYS.filter((key) => key in record)
    : [];
  const reactivos = record?.reactivos;
  const comentarios = record?.comentarios;

  return {
    payloadType: valueType(body),
    payloadKeyNames,
    payloadKeyTypes: Object.fromEntries(
      payloadKeyNames.map((key) => [key, valueType(record?.[key])]),
    ),
    reactivosCount: Array.isArray(reactivos) ? reactivos.length : null,
    comment: {
      present: comentarios !== undefined && comentarios !== null,
      length: typeof comentarios === "string" ? comentarios.length : null,
    },
  };
}

function validationIssues(error: {
  issues: { path: (string | number)[]; code: string }[];
}) {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join(".") || "payload",
    reasonCategory: issue.code,
  }));
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const logError = (
    stage: DiagnosticStage,
    error: unknown,
    context: Record<string, unknown> = {},
  ) => {
    console.error("[API Autodiagnóstico] request failed", {
      correlationId,
      elapsedMs: Date.now() - startedAt,
      stage,
      error: serializeSafeError(error),
      ...context,
    });
  };
  const internalErrorResponse = () =>
    new Response(
      JSON.stringify({
        error: "No fue posible guardar el autodiagnóstico.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );

  let cliente;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ["docente", "pendiente"]);
    cliente = auth.client;
    userId = auth.user.id;
  } catch (error) {
    logError("auth", error, {
      responseStatus: error instanceof AuthError ? error.response.status : 500,
    });
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }

  try {
    const { data: usuario, error: usuarioError } = await cliente
      .from("usuarios")
      .select("entidad_id,rol,email")
      .eq("id", userId)
      .maybeSingle();
    if (usuarioError || !usuario) {
      logError(
        "usuario_lookup",
        usuarioError ?? new Error("No se encontró el perfil del docente"),
        { responseStatus: 403 },
      );
      return new Response(
        JSON.stringify({
          error: "Solo docentes pueden enviar autodiagnóstico",
        }),
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      logError("json_parse", error, { responseStatus: 500 });
      return internalErrorResponse();
    }

    const parseResult = AutodiagnosticoSchema.safeParse(body);
    if (!parseResult.success) {
      logError("payload_validation", new Error("Payload rejected by schema"), {
        responseStatus: 400,
        validationIssues: validationIssues(parseResult.error),
        ...payloadSummary(body),
      });
      return new Response(
        JSON.stringify({
          error: "Todos los campos son obligatorios excepto comentarios",
          detalles: formatZodFieldErrors(parseResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const {
      cuatrimestre_id,
      nombre,
      apellido_paterno,
      apellido_materno,
      campus,
      oferta_academica,
      turno,
      modalidad,
      reactivos,
      comentarios,
    } = parseResult.data;

    const accessResponse = await requireTeacherAutodiagnosticoSubmissionOpen(
      cliente,
      cuatrimestre_id,
    );
    if (accessResponse) {
      logError(
        "window_state",
        new Error("Submission window rejected request"),
        {
          responseStatus: accessResponse.status,
        },
      );
      return accessResponse;
    }

    const moderacion = validarComentarioOpcional(
      comentarios,
      MAX_COMENTARIO_LONGITUD,
    );
    if (!moderacion.valido) {
      logError("comment_moderation", new Error("Comment rejected"), {
        responseStatus: 400,
        reasonCategory:
          typeof comentarios === "string" &&
          comentarios.length > MAX_COMENTARIO_LONGITUD
            ? "max_length"
            : "blacklist",
        comment: {
          present: comentarios !== undefined && comentarios !== null,
          length: typeof comentarios === "string" ? comentarios.length : null,
        },
      });
      return new Response(
        JSON.stringify({ error: moderacion.error, code: "comment_rejected" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1. Crear o actualizar docente
    let docenteId = usuario.entidad_id;
    const apellidos = `${apellido_paterno} ${apellido_materno}`.trim();

    // Si es pendiente, auto-asignar rol docente al completar AD
    if (usuario.rol === "pendiente") {
      const { error: promotionError } = await cliente
        .from("usuarios")
        .update({ rol: "docente" })
        .eq("id", userId);
      if (promotionError)
        logError("docente_update", promotionError, {
          operation: "role_promotion",
        });
    }

    if (docenteId) {
      const { error: errUpd } = await cliente
        .from("docentes")
        .update({
          nombre,
          apellido_paterno,
          apellido_materno,
          apellidos,
          campus,
          turno,
          oferta_academica,
          modalidad,
        })
        .eq("id", docenteId);
      if (errUpd) {
        logError("docente_update", errUpd, { operation: "profile_update" });
        throw new Error("Error al actualizar docente");
      }
    } else {
      const { data: existenteDoc, error: existingDocError } = await cliente
        .from("docentes")
        .select("id")
        .eq("email", usuario.email)
        .maybeSingle();
      if (existingDocError)
        logError("docente_create", existingDocError, {
          operation: "existing_teacher_lookup",
        });
      if (existenteDoc) {
        docenteId = existenteDoc.id;
        const { error: linkError } = await cliente
          .from("usuarios")
          .update({ entidad_id: docenteId })
          .eq("id", userId);
        if (linkError)
          logError("docente_link", linkError, {
            operation: "link_existing_teacher",
          });
        const { error: existingUpdateError } = await cliente
          .from("docentes")
          .update({
            nombre,
            apellido_paterno,
            apellido_materno,
            apellidos,
            campus,
            turno,
            oferta_academica,
            modalidad,
          })
          .eq("id", docenteId);
        if (existingUpdateError)
          logError("docente_update", existingUpdateError, {
            operation: "update_existing_teacher",
          });
      } else {
        const { data: nuevo, error: errIns } = await cliente
          .from("docentes")
          .insert({
            nombre,
            apellido_paterno,
            apellido_materno,
            apellidos,
            email: usuario.email,
            campus,
            turno,
            oferta_academica,
            modalidad,
          })
          .select("id")
          .single();
        if (errIns) {
          logError("docente_create", errIns, { operation: "create_teacher" });
          throw new Error("Error al crear docente");
        }
        docenteId = nuevo.id;
        const { error: linkError } = await cliente
          .from("usuarios")
          .update({ entidad_id: docenteId })
          .eq("id", userId);
        if (linkError)
          logError("docente_link", linkError, {
            operation: "link_created_teacher",
          });
      }
    }

    // 2. Verificar si ya respondió
    const { data: existente, error: duplicateError } = await cliente
      .from("autodiagnosticos")
      .select("id")
      .eq("docente_id", docenteId)
      .eq("cuatrimestre_id", cuatrimestre_id)
      .maybeSingle();
    if (duplicateError)
      logError("duplicate_check", duplicateError, {
        operation: "existing_submission_lookup",
      });
    if (existente) {
      logError("duplicate_check", new Error("Duplicate submission"), {
        responseStatus: 409,
      });
      return new Response(
        JSON.stringify({
          error: "Ya completaste tu autodiagnóstico para este cuatrimestre",
        }),
        { status: 409 },
      );
    }

    // 3. Insertar autodiagnóstico
    const insert: Record<string, unknown> = {
      docente_id: docenteId,
      cuatrimestre_id,
    };
    for (let i = 0; i < 24; i++) insert[`r${i + 1}`] = reactivos[i];

    const suma = reactivos.reduce((a: number, b: number) => a + b, 0);
    const promedio = Math.round((suma / 120) * 100);
    let nivel = "Necesita Mejora";
    if (promedio >= 90) nivel = "Excelente";
    else if (promedio >= 75) nivel = "Satisfactorio";
    else if (promedio >= 60) nivel = "En Desarrollo";
    insert.nivel_desempeno = nivel;
    if (moderacion.valorNormalizado)
      insert.comentarios = moderacion.valorNormalizado;

    const { data: resultado, error: errDiag } = await cliente
      .from("autodiagnosticos")
      .insert(insert)
      .select("puntaje_total,nivel_desempeno")
      .single();
    if (errDiag) {
      logError("insert", errDiag, { operation: "insert_submission" });
      throw new Error("Error al guardar autodiagnóstico");
    }

    try {
      await recalcularCalificacionDocente(cliente, docenteId, cuatrimestre_id);
    } catch (recalcError) {
      logError("recalculation", recalcError, {
        operation: "recalculate_teacher_score",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        puntaje_total: resultado.puntaje_total,
        promedio,
        nivel_desempeno: resultado.nivel_desempeno,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    logError("unexpected", error, { responseStatus: 500 });
    return internalErrorResponse();
  }
};
