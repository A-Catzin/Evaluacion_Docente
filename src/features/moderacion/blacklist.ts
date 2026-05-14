/**
 * Módulo de Moderación de Textos — SED-360
 *
 * Proporciona una blacklist configurable de palabras prohibidas
 * y la función `moderarComentario` para validar comentarios de
 * texto abierto antes de persistirlos.
 *
 * La blacklist es insensible a mayúsculas y respeta límites de
 * palabra (word boundaries \b) para evitar falsos positivos con
 * subcadenas.
 *
 * Uso:
 *   import { moderarComentario } from './blacklist';
 *   const resultado = moderarComentario('Qué comentario tan idiota');
 *   // → { esApropiado: false, palabrasDetectadas: ['idiota'] }
 */

// ─── Blacklist de Palabras Prohibidas ──────────────────────────

/** Conjunto de palabras prohibidas (insensible a mayúsculas) */
const BLACKLIST = new Set<string>([
  'idiota',
  'estúpido',
  'tonto',
  'imbécil',
  'puto',
  'puta',
  'pendejo',
  'pendeja',
  'cabrón',
  'cabrona',
  'mierda',
  'coño',
  'carajo',
  'hijueputa',
  'malparido',
  'malparida',
  'marica',
  'verga',
  'culero',
  'culera',
  'pendejada',
  'pendejadas',
]);

// ─── Utilidades ────────────────────────────────────────────────

/**
 * Escapa caracteres especiales de regex en una cadena.
 * Previene inyección de patrones no deseados.
 */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Función Pública ───────────────────────────────────────────

/**
 * Resultado de la moderación de un comentario.
 * - aprobado: true si el texto pasó el filtro
 * - motivo: palabras detectadas (solo si aprobado === false)
 */
export interface ResultadoModeracion {
  aprobado: boolean;
  motivo?: string;
}

/**
 * Modera un comentario contra la blacklist de palabras prohibidas.
 *
 * @param texto - El texto del comentario a evaluar.
 * @returns ResultadoModeracion con `aprobado` (boolean) y `motivo` opcional.
 *
 * Casos:
 *   - Vacío o solo espacios → aprobado (campo opcional)
 *   - Sin palabras prohibidas → aprobado: true
 *   - Con palabras prohibidas → aprobado: false + motivo con palabras detectadas
 */
export function moderarComentario(texto: string): ResultadoModeracion {
  // Texto vacío o solo espacios se considera apropiado
  if (!texto || texto.trim().length === 0) {
    return { aprobado: true };
  }

  const normalizado = texto.toLowerCase();
  const palabrasDetectadas: string[] = [];

  for (const palabra of BLACKLIST) {
    // Expresión regular con límites de palabra y case-insensitive
    const regex = new RegExp(`\\b${escaparRegex(palabra)}\\b`, 'i');
    if (regex.test(normalizado)) {
      palabrasDetectadas.push(palabra);
    }
  }

  if (palabrasDetectadas.length === 0) {
    return { aprobado: true };
  }

  return {
    aprobado: false,
    motivo: `El comentario contiene lenguaje inapropiado: ${palabrasDetectadas.join(', ')}`,
  };
}

/**
 * @deprecated Usar `moderarComentario` que retorna `ResultadoModeracion`.
 * Mantenido por compatibilidad con código existente.
 */
export function moderarComentarioLegado(
  texto: string
): { esApropiado: boolean; palabrasDetectadas: string[] } {
  const resultado = moderarComentario(texto);
  return {
    esApropiado: resultado.aprobado,
    palabrasDetectadas: resultado.motivo
      ? resultado.motivo.replace('El comentario contiene lenguaje inapropiado: ', '').split(', ')
      : [],
  };
}
