import { z } from 'zod';
import {
  OBSERVATION_INSTRUMENT_DEFINITIONS,
  type ObservationInstrumentVersion,
} from '../observationDefinitions';
import { MAX_COMENTARIO_LONGITUD, MAX_NOTA_SECCION_LONGITUD } from '../moderation';

const REACTIVOS_ESTUDIANTE_COUNT = 19;

export const EstudianteEvaluacionSchema = z.object({
  grupo_id: z.number().int().positive('grupo_id debe ser un entero positivo'),
  respuestas: z.array(z.number().int()).refine(
    (arr) =>
      arr.length === REACTIVOS_ESTUDIANTE_COUNT &&
      arr.every((answer, index) => {
        const max = index === 0 ? 6 : 4;
        return answer >= 1 && answer <= max;
      }),
    {
      message: 'respuestas debe tener 19 enteros; la primera entre 1 y 6 y el resto entre 1 y 4',
    },
  ),
  comentario: z.string().max(MAX_COMENTARIO_LONGITUD).optional().nullable(),
});

const COORDINACION_REACTIVOS = [
  'a1', 'a2', 'a3',
  'b1', 'b2', 'b3',
  'c1', 'c2', 'c3',
  'd1', 'd2', 'd3',
  'e1', 'e2', 'e3',
] as const;

export const CoordinacionEvaluacionSchema = z.object({
  docente_id: z.number().int().positive(),
  cuatrimestre_id: z.number().int().positive(),
  ciclo: z.string().min(1),
  campus: z.string().min(1),
  comentarios: z.string().max(MAX_COMENTARIO_LONGITUD).optional().nullable(),
}).extend(
  Object.fromEntries(
    COORDINACION_REACTIVOS.map((key) => [
      key,
      z.number().int().min(1).max(5),
    ]),
  ) as Record<typeof COORDINACION_REACTIVOS[number], z.ZodNumber>,
);

export const AutodiagnosticoSchema = z.object({
  cuatrimestre_id: z.number().int().positive(),
  nombre: z.string().min(1),
  apellido_paterno: z.string().min(1),
  apellido_materno: z.string().min(1),
  campus: z.string().min(1),
  oferta_academica: z.string().min(1),
  turno: z.string().min(1),
  modalidad: z.string().min(1),
  reactivos: z.array(z.number().int()).length(24),
  comentarios: z.string().max(MAX_COMENTARIO_LONGITUD).optional().nullable(),
});

export const ToggleVisibilidadSchema = z.object({
  docente_id: z.number().int().positive(),
  visible: z.boolean(),
});

export const RunIdQuerySchema = z.object({
  run_id: z.coerce.number().int().positive(),
});

export const ImportFormSchema = z.object({
  file: z.instanceof(File),
  cuatrimestre_id: z.coerce.number().int().positive(),
});

const OBSERVATION_TEXT_FIELDS = ['comentario_docente', 'comentario_evaluador'] as const;
export const SECTION_NOTES: Record<string, string> = {
  obs_cco: 'obs_cognitivas',
  obs_cme: 'obs_metacognitivas',
  obs_ccom: 'obs_comunicativas',
  obs_cso: 'obs_sociales',
  obs_cge: 'obs_gestion',
  obs_caf: 'obs_afectivas',
  obs_ctepe: 'obs_tecno',
  obs_cno: 'obs_normativa',
};

export function mapObservationNotes(body: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const mapped = SECTION_NOTES[key];
    output[mapped ?? key] = value;
  }
  return output;
}

export function buildObservationSchema(version: ObservationInstrumentVersion) {
  const definition = OBSERVATION_INSTRUMENT_DEFINITIONS[version];
  const questionFields = definition.sections.flatMap((section) =>
    section.fields.map((field) => field.key),
  );
  const noteFields = definition.sections.map((section) => `obs_${section.id}`);

  const shape: Record<string, z.ZodTypeAny> = {
    instrument_version: z.literal(version),
    docente_id: z.number().int().positive(),
    asignatura_id: z.number().int().positive(),
    grupo: z.string().min(1),
    ciclo: z.string().min(1),
    campus: z.string().min(1),
    cuatrimestre_id: z.number().int().positive(),
  };

  for (const field of questionFields) {
    shape[field] = z.number().int().min(0).max(5).optional();
  }

  for (const field of OBSERVATION_TEXT_FIELDS) {
    shape[field] = z.string().max(MAX_COMENTARIO_LONGITUD).nullable().optional();
  }

  for (const field of noteFields) {
    const storageKey = SECTION_NOTES[field] ?? field;
    shape[storageKey] = z.string().max(MAX_NOTA_SECCION_LONGITUD).nullable().optional();
  }

  return z.object(shape).strict();
}
