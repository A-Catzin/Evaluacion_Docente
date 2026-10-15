export const PAGE_SIZE = 20;
export const MAX_PAGE = 10000;
export const MAX_FILTER_IDS = 100;

export type CommentRequest = { cycleId: number; page: number; keyword: string; teacher: string; group: string };

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
  return { cycleId: input.cuatrimestreId as number, page, keyword, teacher, group };
}

export function literalCommentLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function commentDTO(
  row: { docente_id: number; grupo_id: number; comentario_abierto: string | null }, docente: string, grupo: string,
): { docenteId: number; grupoId: number; docente: string; grupo: string; comentario: string } | null {
  if (!Number.isSafeInteger(row.docente_id) || row.docente_id <= 0 ||
      !Number.isSafeInteger(row.grupo_id) || row.grupo_id <= 0 ||
      typeof row.comentario_abierto !== 'string' || !row.comentario_abierto.trim()) return null;
  return { docenteId: row.docente_id, grupoId: row.grupo_id, docente, grupo, comentario: row.comentario_abierto };
}
