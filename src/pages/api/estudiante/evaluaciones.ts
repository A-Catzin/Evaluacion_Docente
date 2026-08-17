import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../lib/auth';
import { EstudianteEvaluacionSchema } from '../../../lib/validation/apiSchemas';
import { formatZodFieldErrors } from '../../../lib/validation/errors';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let client;
  try {
    const auth = await requireRole(cookies, ['estudiante']);
    client = auth.client;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    console.error('[student evaluations] authentication failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json({ error: 'No fue posible verificar la sesión', code: 'session_validation_failed' }, 502);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'La solicitud no es válida', code: 'invalid_request' }, 400);
  }

      const parseResult = EstudianteEvaluacionSchema.safeParse(body);
      if (!parseResult.success) {
        return json({
          error: 'Completa las 19 respuestas con valores válidos',
          code: 'invalid_answers',
          detalles: formatZodFieldErrors(parseResult.error),
        }, 400);
      }

      const { grupo_id, respuestas, comentario } = parseResult.data;
      const comment = comentario?.trim() || null;

  try {
    const { data, error } = await client.rpc('enviar_encuesta_estudiante', {
      p_grupo_id: grupo_id,
      p_respuestas: respuestas,
      p_comentario: comment,
    });
    if (error) {
      if (error.code === '42501') return json({ error: 'No tienes acceso para enviar evaluaciones', code: 'forbidden' }, 403);
      console.error('[student evaluations] submission RPC failed', { code: error.code, message: error.message });
      return json({ error: 'No fue posible registrar la evaluación', code: 'submission_failed' }, 502);
    }

    const result = Array.isArray(data) ? data[0] : null;
    const status = isRecord(result) && typeof result.status === 'string' ? result.status : '';
    if (status === 'completed') return json({ status }, 201);
    if (status === 'already_submitted') return json({ status, error: 'Esta evaluación ya fue completada' }, 409);
    if (status === 'no_active_cycle') return json({ status, error: 'No hay un ciclo activo para recibir evaluaciones' }, 409);
    if (status === 'not_enrolled') return json({ status, error: 'No puedes evaluar este grupo' }, 403);
    if (status === 'invalid_answers' || status === 'invalid_comment') {
      return json({ status, error: 'La información enviada no es válida' }, 400);
    }

    return json({ error: 'No fue posible registrar la evaluación', code: 'submission_failed' }, 502);
  } catch (error) {
    console.error('[student evaluations] session validation failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json({ error: 'No fue posible verificar la sesión', code: 'session_validation_failed' }, 502);
  }
};
