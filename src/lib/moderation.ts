/**
 * Helpers de moderación de texto libre para endpoints de SED-360.
 *
 * Envuelve la blacklist del módulo `src/features/moderacion/blacklist.ts`
 * con validaciones de longitud y normalización, y permite aplicarlas a
 * varios campos de texto en un solo paso.
 */

import { moderarComentario, type ResultadoModeracion } from '../features/moderacion/blacklist';

/** Longitud máxima por defecto para comentarios cortos de texto libre. */
export const MAX_COMENTARIO_LONGITUD = 500;

/** Longitud máxima recomendada para notas de sección en observaciones. */
export const MAX_NOTA_SECCION_LONGITUD = 1000;

export interface ValidacionComentario {
  valido: boolean;
  error?: string;
  valorNormalizado: string | null;
}

/**
 * Valida un campo de texto libre opcional.
 *
 * Reglas:
 * - `null`, `undefined` o cadena vacía (solo espacios) → válido, valor normalizado a `null`.
 * - Si supera `maxLength` → rechazado.
 * - Si contiene palabras de la blacklist → rechazado con motivo.
 * - En otro caso → válido, valor normalizado con `.trim()`.
 */
export function validarComentarioOpcional(
  texto: string | null | undefined,
  maxLength = MAX_COMENTARIO_LONGITUD,
): ValidacionComentario {
  if (texto === null || texto === undefined || texto.trim().length === 0) {
    return { valido: true, valorNormalizado: null };
  }

  if (texto.length > maxLength) {
    return {
      valido: false,
      error: `El comentario no debe superar los ${maxLength} caracteres`,
      valorNormalizado: texto,
    };
  }

  const resultado: ResultadoModeracion = moderarComentario(texto);
  if (!resultado.aprobado) {
    return { valido: false, error: resultado.motivo, valorNormalizado: texto };
  }

  return { valido: true, valorNormalizado: texto.trim() };
}

/**
 * Valida varios campos de texto libre aplicando el mismo límite de longitud.
 *
 * @returns Un mapa con los valores normalizados, o el primer error encontrado.
 */
export function validarCamposDeTextoLibre(
  body: Record<string, unknown>,
  campos: string[],
  maxLength = MAX_COMENTARIO_LONGITUD,
): { valido: boolean; error?: string; valores: Record<string, string | null> } {
  const valores: Record<string, string | null> = {};
  for (const campo of campos) {
    const raw = body[campo];
    const texto = typeof raw === 'string' ? raw : null;
    const resultado = validarComentarioOpcional(texto, maxLength);
    if (!resultado.valido) {
      return { valido: false, error: `[${campo}] ${resultado.error}`, valores };
    }
    valores[campo] = resultado.valorNormalizado;
  }
  return { valido: true, valores };
}

/**
 * Valida varios campos de texto libre con un límite de longitud configurable
 * por campo.
 *
 * @param limites Mapa campo → longitud máxima.
 */
export function validarCamposDeTextoLibreConLimites(
  body: Record<string, unknown>,
  limites: Record<string, number>,
): { valido: boolean; error?: string; valores: Record<string, string | null> } {
  const valores: Record<string, string | null> = {};
  for (const [campo, maxLength] of Object.entries(limites)) {
    const raw = body[campo];
    const texto = typeof raw === 'string' ? raw : null;
    const resultado = validarComentarioOpcional(texto, maxLength);
    if (!resultado.valido) {
      return { valido: false, error: `[${campo}] ${resultado.error}`, valores };
    }
    valores[campo] = resultado.valorNormalizado;
  }
  return { valido: true, valores };
}
