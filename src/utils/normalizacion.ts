import type { ValorLikert } from '../types/supabase';

/**
 * Utilidades de Normalización — Plataforma SED-360
 *
 * Propósito: Convertir respuestas de escala Likert (1-5) a porcentajes
 * base 100 para poder aplicar las ponderaciones del algoritmo 360°.
 *
 * Fórmula Institucional (docs/architecture_patterns.md):
 *   Resultado = ((Valor_obtenido - 1) / (Valor_max - 1)) * 100
 *
 * Ejemplo: Un voto de 4 ("De acuerdo") → ((4-1)/(5-1))*100 = 75%
 *
 * Dependencias: Ninguna externa. Funciones puras.
 * Restricciones: El valor debe estar en el rango [1, valorMaximo].
 */

/** Valor máximo de la escala Likert institucional */
const LIKERT_MAXIMO = 5;
const LIKERT_MINIMO = 1;

/**
 * Normaliza un valor de escala Likert a un porcentaje (0-100).
 *
 * @param valorObtenido - Valor de la escala (1 a 5)
 * @param valorMaximo - Valor máximo de la escala (por defecto 5)
 * @returns Porcentaje normalizado (0-100)
 * @throws Error si el valor está fuera del rango permitido
 *
 * @example
 * normalizarLikertAPorcentaje(4)  // → 75
 * normalizarLikertAPorcentaje(5)  // → 100
 * normalizarLikertAPorcentaje(1)  // → 0
 */
export function normalizarLikertAPorcentaje(
  valorObtenido: number,
  valorMaximo: number = LIKERT_MAXIMO
): number {
  if (valorObtenido < LIKERT_MINIMO || valorObtenido > valorMaximo) {
    throw new Error(
      `Valor ${valorObtenido} fuera del rango Likert permitido [${LIKERT_MINIMO}-${valorMaximo}]`
    );
  }

  return ((valorObtenido - LIKERT_MINIMO) / (valorMaximo - LIKERT_MINIMO)) * 100;
}

/**
 * Valida que un valor sea un ValorLikert válido (type guard).
 */
export function esValorLikert(valor: number): valor is ValorLikert {
  return (
    Number.isInteger(valor) && valor >= LIKERT_MINIMO && valor <= LIKERT_MAXIMO
  );
}

/**
 * Calcula el promedio de un conjunto de respuestas Likert normalizadas.
 *
 * @param respuestas - Array de valores Likert (1-5)
 * @returns Promedio normalizado a base 100
 *
 * @example
 * calcularPromedioNormalizado([4, 5, 3, 4, 5])  // → ((75+100+50+75+100)/5) = 80
 */
export function calcularPromedioNormalizado(respuestas: ValorLikert[]): number {
  if (respuestas.length === 0) {
    return 0;
  }

  const sumaPorcentajes = respuestas.reduce((acumulador, valor) => {
    return acumulador + normalizarLikertAPorcentaje(valor);
  }, 0);

  return sumaPorcentajes / respuestas.length;
}

/**
 * Aplica la ponderación 360° a los promedios normalizados de cada actor.
 *
 * @param promedios - Objeto con los promedios normalizados por tipo de actor
 * @param ponderaciones - Pesos de cada actor (de PONDERACION_360)
 * @returns Puntaje global 360° (0-100)
 *
 * @example
 * calcularPuntajeGlobal({
 *   ALUMNO: 80, COORDINADOR: 90, TECNICO: 75, CALIDAD: 85, AUTO: 70
 * }, PONDERACION_360)
 * // → (80*0.35)+(90*0.20)+(75*0.25)+(85*0.15)+(70*0.05) = 80.5
 */
export function calcularPuntajeGlobal(
  promedios: Partial<Record<string, number>>,
  ponderaciones: Record<string, number>
): number {
  let puntajeGlobal = 0;
  let pesoTotalAplicado = 0;

  for (const [actor, peso] of Object.entries(ponderaciones)) {
    const promedio = promedios[actor];
    if (promedio !== undefined && promedio !== null) {
      puntajeGlobal += promedio * peso;
      pesoTotalAplicado += peso;
    }
  }

  // Si no se aplicó ningún peso, devolver 0
  if (pesoTotalAplicado === 0) return 0;

  // Normalizar si no todos los actores evaluaron
  return puntajeGlobal / pesoTotalAplicado;
}
