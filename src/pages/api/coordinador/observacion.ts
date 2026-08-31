import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { isObservationInstrumentVersion } from "../../../lib/observationDefinitions";
import {
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
  validarCamposDeTextoLibreConLimites,
} from "../../../lib/moderation";
import {
  buildObservationSchema,
  mapObservationNotes,
  SECTION_NOTES,
} from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import { canObserveAssignedTeacher } from "../../../lib/teacherAssignments";
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from "../../../services/calificaciones";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const POST: APIRoute = async ({ request, cookies }) => {
  let cl;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ["superadmin", "coordinador", "observador"]);
    cl = auth.client;
    userId = auth.user.id;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  try {

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(
        JSON.stringify({ error: "Datos de observación no válidos" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const submission = body as Record<string, unknown>;

    if (!isObservationInstrumentVersion(submission.instrument_version)) {
      return new Response(
        JSON.stringify({ error: "Versión de instrumento no válida" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const normalized = mapObservationNotes(submission);
    const parseResult = buildObservationSchema(
      submission.instrument_version,
    ).safeParse(normalized);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Datos de observación no válidos",
          detalles: formatZodFieldErrors(parseResult.error),
        }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const noteFields = Object.values(SECTION_NOTES);
    const limites: Record<string, number> = {
      comentario_docente: MAX_COMENTARIO_LONGITUD,
      comentario_evaluador: MAX_COMENTARIO_LONGITUD,
    };
    for (const field of noteFields) {
      limites[field] = MAX_NOTA_SECCION_LONGITUD;
    }
    const moderacion = validarCamposDeTextoLibreConLimites(
      parseResult.data,
      limites,
    );
    if (!moderacion.valido) {
      return new Response(
        JSON.stringify({ error: moderacion.error, code: "comment_rejected" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const datos: Record<string, unknown> = {
      evaluador_id: userId,
      ...parseResult.data,
      ...moderacion.valores,
    };

    const { docente_id, cuatrimestre_id } = parseResult.data;

    if (!await canObserveAssignedTeacher(cl, docente_id, cuatrimestre_id)) {
      return new Response(
        JSON.stringify({ error: "No tienes asignación de observación para este docente" }),
        { status: 403, headers: JSON_HEADERS },
      );
    }

    const { data, error } = await cl
      .from("observaciones")
      .insert(datos)
      .select()
      .single();
    if (error) {
      if (error.code === "23505")
        return new Response(
          JSON.stringify({
            error: "Ya existe una observación para este docente en este ciclo",
          }),
          { status: 409, headers: JSON_HEADERS },
        );
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    try {
      await recalcularCalificacionDocente(cl, docente_id, cuatrimestre_id);
    } catch (recalcError) {
      logRecalcError(docente_id, cuatrimestre_id, recalcError);
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 201,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
