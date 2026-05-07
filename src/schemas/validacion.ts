import { z } from 'zod';

/**
 * Schemas de Validación — Plataforma SED-360
 *
 * Propósito: Definir los esquemas Zod para validar todos los payloads
 * que entran al sistema: formularios de evaluación, parámetros de API,
 * y respuestas de la base de datos.
 *
 * Dependencias: Zod, tipos en src/types/supabase.ts
 */

// ─── Validación de Escala Likert ────────────────────────────────

/** Valida que un valor sea un Likert válido (1-5) */
export const schemaValorLikert = z
  .number()
  .int()
  .min(1, 'El valor mínimo es 1')
  .max(5, 'El valor máximo es 5');

// ─── Validación de Envío de Evaluación ──────────────────────────

/** Schema para validar el envío de una evaluación */
export const schemaEnvioEvaluacion = z.object({
  id_evaluador: z.string().uuid('ID de evaluador inválido'),
  id_carga: z.number().int().positive('ID de carga académica inválido'),
  tipo_actor: z.enum(['ALUMNO', 'COORDINADOR', 'TECNICO', 'CALIDAD', 'AUTO'] as const),
  respuestas: z
    .record(z.string(), schemaValorLikert)
    .refine(
      (obj) => Object.keys(obj).length > 0,
      'Debe incluir al menos una respuesta'
    ),
  comentario: z
    .string()
    .max(1000, 'El comentario no puede exceder 1000 caracteres')
    .nullable()
    .optional(),
});

export type EnvioEvaluacion = z.infer<typeof schemaEnvioEvaluacion>;

// ─── Validación de Periodo ─────────────────────────────────────

/** Schema para parámetros de periodo (ej: "2025-1") */
export const schemaPeriodo = z
  .string()
  .regex(/^\d{4}-\d{1,2}$/, 'Formato de periodo inválido. Use AAAA-N');

// ─── Validación de Email Institucional ──────────────────────────

/** Schema para validar el dominio del email */
export const schemaEmailInstitucional = z
  .string()
  .email('Email inválido')
  .refine(
    (email) => email.endsWith('@tecplayacar.edu.mx'),
    'El correo debe pertenecer al dominio @tecplayacar.edu.mx'
  );
