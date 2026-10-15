import { describe, expect, it } from 'vitest';
import { mapCurrentObservers, parseTrackingQuery, matchingIds, loadCatalog, CATALOG_PAGE_SIZE } from './adminObservationTracking';

describe('seguimiento de instrumentos', () => {
  it('limita la página y conserva filtros sin aceptar ciclos ajenos', () => {
    const parsed = parseTrackingQuery(new URLSearchParams('cuatrimestre=8&page=999999999&docente=Ana&estado=valid&grupo=3A'), [3, 8], 3);
    expect(parsed).toMatchObject({ cycleId: 8, page: 10000, teacher: 'Ana', status: 'valid', group: '3A' });
    expect(parseTrackingQuery(new URLSearchParams('cuatrimestre=99&page=-4&estado=otro'), [3], 3)).toMatchObject({ cycleId: 3, page: 1, status: '' });
  });
  it('excluye únicamente la cuenta de proyectos y conserva todos los observadores activos', () => {
    const result = mapCurrentObservers([{ docente_id: 4, evaluator_id: 'a' }, { docente_id: 4, evaluator_id: 'b' }, { docente_id: 4, evaluator_id: 'c' }], [
      { id: 'a', email: 'proyectos-tup@tecplayacar.edu.mx' }, { id: 'b', email: 'tup7433@tecplayacar.edu.mx' }, { id: 'c', email: 'otro@ejemplo.mx' },
    ]);
    expect(result.get(4)).toEqual(['tup7433@tecplayacar.edu.mx', 'otro@ejemplo.mx']);
  });
  it('distingue una búsqueda sin coincidencias de una búsqueda sin filtro', () => {
    expect(matchingIds([{ id: 1, label: 'Ana Gómez' }], 'pepe')).toEqual([]);
    expect(matchingIds([{ id: 1, label: 'Ana Gómez' }], '')).toEqual([1]);
  });
  it('lee todas las páginas incluso cuando la última está llena', async () => {
const fetch = async (start: number) => ({ data: Array.from({ length: Math.min(CATALOG_PAGE_SIZE, 2000 - start) }, (_, i) => start + i), error: null });
expect(await loadCatalog(fetch)).toHaveLength(2000);
  });
  it('rechaza catálogos que exceden el límite y errores intermedios', async () => {
await expect(loadCatalog(async () => ({ data: Array(CATALOG_PAGE_SIZE).fill(1), error: null }), CATALOG_PAGE_SIZE)).rejects.toThrow();
await expect(loadCatalog(async (start: number) => start ? { data: null, error: new Error('falló') } : { data: Array(CATALOG_PAGE_SIZE).fill(1), error: null })).rejects.toThrow('falló');
  });
});
