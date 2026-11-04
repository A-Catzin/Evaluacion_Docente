import { describe, expect, it } from 'vitest';
import { categoryBadgeClass, categoryForScore, CATEGORY_NAMES_360 } from './categoria360';

describe('360 categories', () => {
  it('uses the institutional ranges at every boundary', () => {
    const cases: Array<[number, string]> = [
      [100, 'Sobresaliente'], [95, 'Sobresaliente'],
      [94.99, 'Eficaz'], [86, 'Eficaz'],
      [85.99, 'Adecuado'], [76, 'Adecuado'],
      [75.99, 'Proceso de Mejora'], [66, 'Proceso de Mejora'],
      [65.99, 'Desempeño Crítico'], [65, 'Desempeño Crítico'], [0, 'Desempeño Crítico'],
    ];
    for (const [score, name] of cases) expect(categoryForScore(score), String(score)).toBe(name);
  });
  it('lists the five levels from best to worst and styles unknown names neutrally', () => {
    expect(CATEGORY_NAMES_360).toEqual(['Sobresaliente', 'Eficaz', 'Adecuado', 'Proceso de Mejora', 'Desempeño Crítico']);
    expect(categoryBadgeClass('Eficaz')).toContain('blue');
    expect(categoryBadgeClass('Parcial')).toContain('slate');
    expect(categoryBadgeClass('Bueno')).toContain('slate');
  });
});
