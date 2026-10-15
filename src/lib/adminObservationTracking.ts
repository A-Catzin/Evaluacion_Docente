export type TrackingUser = { id: string; email: string | null };
export type TrackingAssignment = { docente_id: number; evaluator_id: string };

export const CATALOG_PAGE_SIZE = 500;
const CATALOG_MAX_ROWS = 10000;

export async function loadCatalog<T>(
  fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = CATALOG_MAX_ROWS,
): Promise<T[]> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error('Límite de catálogo inválido');
  const rows: T[] = [];
  for (let start = 0; start <= maxRows; start += CATALOG_PAGE_SIZE) {
    const size = Math.min(CATALOG_PAGE_SIZE, maxRows - start + 1);
    const { data, error } = await fetchPage(start, start + size - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length > size) throw new Error('Respuesta de catálogo incompleta');
    rows.push(...data);
    if (rows.length > maxRows) throw new Error('Catálogo excede el límite');
    if (data.length < size) return rows;
  }
  throw new Error('Catálogo excede el límite');
}

export function parseTrackingQuery(params: URLSearchParams, cycleIds: number[], fallback: number) {
  const cycle = Number(params.get('cuatrimestre'));
  const rawPage = params.get('page') || '1';
  const page = /^\d+$/.test(rawPage) ? Math.min(10000, Math.max(1, Number(rawPage))) : 1;
  const text = (key: string) => (params.get(key) || '').trim().slice(0, 100);
  const status = text('estado');
  return {
    cycleId: cycleIds.includes(cycle) ? cycle : fallback,
    page,
    teacher: text('docente'), observer: text('observador'), instrument: text('instrumento'),
    group: text('grupo'), status: ['valid', 'invalid_excessive_na'].includes(status) ? status : '',
  };
}

export function matchingIds<T extends { id: number | string; label: string }>(rows: T[], term: string): T['id'][] {
  return rows.filter(row => row.label.toLocaleLowerCase('es').includes(term.toLocaleLowerCase('es'))).map(row => row.id);
}

export function mapCurrentObservers(assignments: TrackingAssignment[], users: TrackingUser[]): Map<number, string[]> {
  const emails = new Map(users.map(user => [user.id, user.email]));
  const result = new Map<number, string[]>();
  for (const assignment of assignments) {
    const email = emails.get(assignment.evaluator_id);
    if (email?.toLowerCase() === 'proyectos-tup@tecplayacar.edu.mx') continue;
    const label = email || 'Usuario no disponible';
    const existing = result.get(assignment.docente_id) || [];
    if (!existing.includes(label)) existing.push(label);
    result.set(assignment.docente_id, existing);
  }
  return result;
}

export function literalLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}
