import type { APIRoute } from 'astro';
import { crearClienteConSesion } from '../../../lib/supabaseClient';

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

function validAnswers(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === 19
    && value.every((answer, index) => Number.isInteger(answer) && answer >= 1 && answer <= (index === 0 ? 6 : 4));
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) return json({ error: 'Sesión no válida', code: 'session_invalid' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'La solicitud no es válida', code: 'invalid_request' }, 400);
  }

  if (!isRecord(body)
    || !Number.isSafeInteger(body.grupo_id)
    || (body.grupo_id as number) <= 0
    || !validAnswers(body.respuestas)
    || (body.comentario !== undefined && body.comentario !== null && typeof body.comentario !== 'string')) {
    return json({ error: 'Completa las 19 respuestas con valores válidos', code: 'invalid_answers' }, 400);
  }

  const comment = typeof body.comentario === 'string' ? body.comentario.trim() : null;
  if (comment && comment.length > 2000) {
    return json({ error: 'El comentario no puede exceder 2000 caracteres', code: 'invalid_comment' }, 400);
  }

  try {
    const client = crearClienteConSesion(accessToken);
    const { data: session, error: sessionError } = await client.auth.getUser(accessToken);
    if (sessionError || !session.user) return json({ error: 'Sesión no válida', code: 'session_invalid' }, 401);

    const { data, error } = await client.rpc('enviar_encuesta_estudiante', {
      p_grupo_id: body.grupo_id,
      p_respuestas: body.respuestas,
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
