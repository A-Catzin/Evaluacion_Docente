import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { OBSERVATION_INSTRUMENT_DEFINITIONS, isObservationInstrumentVersion } from '../../../lib/observationDefinitions';

const IDENTITY_FIELDS = ['docente_id', 'asignatura_id', 'grupo', 'ciclo', 'campus', 'cuatrimestre_id', 'instrument_version'] as const;
const REQUIRED_NUMBER_FIELDS = ['docente_id', 'asignatura_id', 'cuatrimestre_id'] as const;
const REQUIRED_TEXT_FIELDS = ['grupo', 'ciclo', 'campus'] as const;
const TEXT_FIELDS = ['comentario_docente', 'comentario_evaluador'] as const;
const SECTION_NOTES: Record<string, string> = {
  obs_cco: 'obs_cognitivas',
  obs_cme: 'obs_metacognitivas',
  obs_ccom: 'obs_comunicativas',
  obs_cso: 'obs_sociales',
  obs_cge: 'obs_gestion',
  obs_caf: 'obs_afectivas',
  obs_ctepe: 'obs_tecno',
  obs_cno: 'obs_normativa',
};

function validationError() {
  return new Response(JSON.stringify({ error: 'Datos de observación no válidos' }), { status: 400 });
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

function normalizeRequiredText(value: unknown): string | undefined {
  const text = normalizeText(value);
  return text || undefined;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || !['superadmin','coordinador','observador'].includes(u.rol)) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return validationError();
    const submission = body as Record<string, unknown>;

    if (!isObservationInstrumentVersion(submission.instrument_version)) {
      return validationError();
    }

    const definition = OBSERVATION_INSTRUMENT_DEFINITIONS[submission.instrument_version];
    const questionFields = definition.sections.flatMap((section) => section.fields.map((field) => field.key));
    const noteFields = definition.sections.map((section) => `obs_${section.id}`);
    const allowedFields = new Set([...IDENTITY_FIELDS, ...TEXT_FIELDS, ...questionFields, ...noteFields]);
    if (Object.keys(submission).some((field) => !allowedFields.has(field))) return validationError();

    const datos: Record<string, unknown> = {
      evaluador_id: s.user.id,
      instrument_version: submission.instrument_version,
    };
    for (const field of REQUIRED_NUMBER_FIELDS) {
      const value = submission[field];
      if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) return validationError();
      datos[field] = value;
    }
    for (const field of REQUIRED_TEXT_FIELDS) {
      const value = normalizeRequiredText(submission[field]);
      if (value === undefined) return validationError();
      datos[field] = value;
    }

    for (const field of questionFields) {
      if (!hasOwn(submission, field)) continue;
      const value = submission[field];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) return validationError();
      datos[field] = value;
    }

    for (const field of [...TEXT_FIELDS, ...noteFields]) {
      if (!hasOwn(submission, field)) continue;
      const value = normalizeText(submission[field]);
      if (value === undefined) return validationError();
      datos[SECTION_NOTES[field] || field] = value;
    }

    const { data, error } = await cl.from('observaciones').insert(datos).select().single();
    if (error) {
      if (error.code === '23505') return new Response(JSON.stringify({ error: 'Ya existe una observación para este docente en este ciclo' }), { status: 409 });
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
