import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { isObservationInstrumentVersion } from '../../../lib/observationDefinitions';
import {
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
  validarCamposDeTextoLibreConLimites,
} from '../../../lib/moderation';
import {
  buildObservationSchema,
  mapObservationNotes,
  SECTION_NOTES,
} from '../../../lib/validation/apiSchemas';
import { formatZodFieldErrors } from '../../../lib/validation/errors';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: JSON_HEADERS });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: JSON_HEADERS });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || !['superadmin','coordinador','observador'].includes(u.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403, headers: JSON_HEADERS });

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: 'Datos de observación no válidos' }), { status: 400, headers: JSON_HEADERS });
    }
    const submission = body as Record<string, unknown>;

    if (!isObservationInstrumentVersion(submission.instrument_version)) {
      return new Response(JSON.stringify({ error: 'Versión de instrumento no válida' }), { status: 400, headers: JSON_HEADERS });
    }

    const normalized = mapObservationNotes(submission);
    const parseResult = buildObservationSchema(submission.instrument_version).safeParse(normalized);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Datos de observación no válidos', detalles: formatZodFieldErrors(parseResult.error) }),
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
    const moderacion = validarCamposDeTextoLibreConLimites(parseResult.data, limites);
    if (!moderacion.valido) {
      return new Response(
        JSON.stringify({ error: moderacion.error, code: 'comment_rejected' }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const datos: Record<string, unknown> = {
      evaluador_id: s.user.id,
      ...parseResult.data,
      ...moderacion.valores,
    };

    const { data, error } = await cl.from('observaciones').insert(datos).select().single();
    if (error) {
      if (error.code === '23505') return new Response(JSON.stringify({ error: 'Ya existe una observación para este docente en este ciclo' }), { status: 409, headers: JSON_HEADERS });
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: JSON_HEADERS });
  }
};
