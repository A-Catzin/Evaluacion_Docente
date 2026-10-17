export const PAGE_SIZE = 20;
export const MAX_PAGE = 10000;
export const MAX_FILTER_IDS = 100;

export const COMMENT_STATES = ['todos', 'pendientes', 'validados'] as const;
export type CommentState = typeof COMMENT_STATES[number];
export type CommentRequest = { cycleId: number; page: number; keyword: string; teacher: string; group: string; state: CommentState };

export function parseCommentRequest(body: unknown, verifiedCycles: number[]): CommentRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (!Number.isSafeInteger(input.cuatrimestreId) || !verifiedCycles.includes(input.cuatrimestreId as number)) return null;
  const page = input.page === undefined ? 1 : input.page;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) return null;
  const text = (key: string): string | null => {
    const value = input[key] === undefined ? '' : input[key];
    return typeof value === 'string' && value.length <= 100 ? value.trim() : null;
  };
  const keyword = text('keyword');
  const teacher = text('docente');
  const group = text('grupo');
  if (keyword === null || teacher === null || group === null || (keyword.length > 0 && keyword.length < 2)) return null;
  const state = input.estado === undefined ? 'todos' : input.estado;
  if (!COMMENT_STATES.includes(state as CommentState)) return null;
  return { cycleId: input.cuatrimestreId as number, page, keyword, teacher, group, state: state as CommentState };
}

export function literalCommentLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

// The response id is exposed to superadmins only so a comment can be validated;
// it carries no student identity.
export function commentDTO(
  row: { id: number; docente_id: number; grupo_id: number; comentario_abierto: string | null; comentario_validado: boolean | null },
  docente: string, grupo: string,
): { id: number; docenteId: number; grupoId: number; docente: string; grupo: string; comentario: string; validado: boolean } | null {
  if (!Number.isSafeInteger(row.id) || row.id <= 0 ||
      !Number.isSafeInteger(row.docente_id) || row.docente_id <= 0 ||
      !Number.isSafeInteger(row.grupo_id) || row.grupo_id <= 0 ||
      typeof row.comentario_abierto !== 'string' || !row.comentario_abierto.trim()) return null;
  return { id: row.id, docenteId: row.docente_id, grupoId: row.grupo_id, docente, grupo, comentario: row.comentario_abierto, validado: row.comentario_validado === true };
}

export type ValidationRequest = { cycleId: number; validate: number[]; unvalidate: number[] };

/** One page of decisions at most: checked ids are validated, unchecked ids are withdrawn. */
export function parseValidationRequest(body: unknown, verifiedCycles: number[]): ValidationRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (!Number.isSafeInteger(input.cuatrimestreId) || !verifiedCycles.includes(input.cuatrimestreId as number)) return null;
  const ids = (value: unknown): number[] | null =>
    Array.isArray(value) && value.length <= PAGE_SIZE && value.every(id => Number.isSafeInteger(id) && (id as number) > 0)
      ? [...new Set(value as number[])] : null;
  const validate = ids(input.validar);
  const unvalidate = ids(input.quitar);
  if (!validate || !unvalidate || validate.length + unvalidate.length === 0 ||
      validate.length + unvalidate.length > PAGE_SIZE || validate.some(id => unvalidate.includes(id))) return null;
  return { cycleId: input.cuatrimestreId as number, validate, unvalidate };
}
