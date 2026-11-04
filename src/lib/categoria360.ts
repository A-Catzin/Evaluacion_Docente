/**
 * Overall (360) performance categories, from the institutional table:
 * Sobresaliente 95-100, Eficaz 86-94, Adecuado 76-85, Proceso de Mejora 66-75, Desempeño Crítico 0-65.
 * Scores carry decimals, so each category starts at its lower bound (94.5 is Eficaz, 65.5 is Desempeño Crítico).
 * "Parcial" and "No iniciado" are not performance levels: they mean instruments are still missing.
 */
export const CATEGORIES_360 = [
  { name: 'Sobresaliente', min: 95, badge: 'bg-emerald-100 text-emerald-700' },
  { name: 'Eficaz', min: 86, badge: 'bg-blue-100 text-blue-700' },
  { name: 'Adecuado', min: 76, badge: 'bg-purple-100 text-purple-700' },
  { name: 'Proceso de Mejora', min: 66, badge: 'bg-orange-100 text-orange-700' },
  { name: 'Desempeño Crítico', min: 0, badge: 'bg-red-100 text-red-700' },
] as const;

export type Category360 = (typeof CATEGORIES_360)[number]['name'];

export const CATEGORY_NAMES_360: string[] = CATEGORIES_360.map((category) => category.name);

export function categoryForScore(score: number): Category360 {
  return (CATEGORIES_360.find((category) => score >= category.min) ?? CATEGORIES_360[CATEGORIES_360.length - 1]).name;
}

const NEUTRAL_BADGE = 'bg-slate-100 text-slate-600';

export function categoryBadgeClass(name: string): string {
  return CATEGORIES_360.find((category) => category.name === name)?.badge ?? NEUTRAL_BADGE;
}
