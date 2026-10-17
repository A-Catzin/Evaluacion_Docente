export type PendingSurvey = { materia: string; docente: string; grupo: string };

export type FollowupRow = {
  estudiante_id: number;
  nombre: string;
  matricula: string | null;
  email: string | null;
  tiene_cuenta: boolean;
  ultimo_acceso: string | null;
  planes: string | null;
  asignadas: number;
  completadas: number;
  pendientes: PendingSurvey[];
};

export const FOLLOWUP_STATES = {
  pendientes: 'Con encuestas pendientes',
  'sin-sesion': 'Nunca ha iniciado sesión',
  'en-proceso': 'Inició sesión y tiene pendientes',
  completos: 'Completaron todas',
  todos: 'Todos',
} as const;

export type FollowupState = keyof typeof FOLLOWUP_STATES;
export type FollowupFilters = { q: string; plan: string; state: FollowupState; page: number };

export const FOLLOWUP_PAGE_SIZE = 50;

export function parseFollowupFilters(params: URLSearchParams): FollowupFilters {
  const state = params.get('estado') || 'pendientes';
  const page = Number.parseInt(params.get('pagina') || '1', 10);
  return {
    q: (params.get('q') || '').trim().slice(0, 100),
    plan: (params.get('plan') || '').trim().slice(0, 100),
    state: state in FOLLOWUP_STATES ? (state as FollowupState) : 'pendientes',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

export function isPending(row: FollowupRow): boolean {
  return row.completadas < row.asignadas;
}

export function filterFollowupRows(rows: FollowupRow[], filters: FollowupFilters): FollowupRow[] {
  const term = normalize(filters.q);
  return rows.filter((row) => {
    if (filters.state === 'pendientes' && !isPending(row)) return false;
    if (filters.state === 'sin-sesion' && (!isPending(row) || row.tiene_cuenta)) return false;
    if (filters.state === 'en-proceso' && (!isPending(row) || !row.tiene_cuenta)) return false;
    if (filters.state === 'completos' && isPending(row)) return false;
    if (filters.plan && !(row.planes || '').split(' · ').includes(filters.plan)) return false;
    if (term && ![row.nombre, row.matricula, row.email].some((v) => v && normalize(v).includes(term))) return false;
    return true;
  });
}

export function summarizeFollowup(rows: FollowupRow[]) {
  const assigned = rows.reduce((sum, row) => sum + row.asignadas, 0);
  const completed = rows.reduce((sum, row) => sum + row.completadas, 0);
  const pending = rows.filter(isPending);
  return {
    students: rows.length,
    pendingStudents: pending.length,
    neverLoggedIn: pending.filter((row) => !row.tiene_cuenta).length,
    completeStudents: rows.length - pending.length,
    assigned,
    completed,
    progress: assigned ? (completed / assigned) * 100 : 0,
  };
}

export function followupPlans(rows: FollowupRow[]): string[] {
  const plans = new Set<string>();
  for (const row of rows) for (const plan of (row.planes || '').split(' · ')) if (plan) plans.add(plan);
  return [...plans].sort((a, b) => a.localeCompare(b, 'es'));
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // Prefix formula-like values so spreadsheets do not execute them.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function followupCsv(rows: FollowupRow[]): string {
  const header = ['Nombre', 'Matrícula', 'Correo', 'Plan', 'Ha iniciado sesión', 'Asignadas', 'Completadas', 'Pendientes', 'Materias pendientes'];
  const lines = rows.map((row) => [
    row.nombre,
    row.matricula || '',
    row.email || '',
    row.planes || '',
    row.tiene_cuenta ? 'Sí' : 'No',
    row.asignadas,
    row.completadas,
    row.asignadas - row.completadas,
    row.pendientes.map((p) => `${p.materia} (${p.docente})`).join('; '),
  ].map(csvCell).join(','));
  // BOM so Excel opens accents correctly.
  return '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
}

// PostgREST caps every response at 1000 rows, so the RPC is read in ranged blocks.
export const FOLLOWUP_BLOCK_SIZE = 1000;
export const FOLLOWUP_MAX_ROWS = 5000;

type RangedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => {
    range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

export async function fetchFollowupRows(
  client: RangedRpc,
  cycleId: number,
): Promise<{ rows: FollowupRow[]; truncated: boolean }> {
  const raw: FollowupRow[] = [];
  for (let from = 0; from < FOLLOWUP_MAX_ROWS; from += FOLLOWUP_BLOCK_SIZE) {
    const { data, error } = await client
      .rpc('admin_seguimiento_encuestas_estudiantes', { p_cuatrimestre_id: cycleId })
      .range(from, from + FOLLOWUP_BLOCK_SIZE - 1);
    if (error) throw error;
    const block = (data || []) as FollowupRow[];
    raw.push(...block);
    if (block.length < FOLLOWUP_BLOCK_SIZE) {
      return { rows: raw.map(normalizeRow), truncated: false };
    }
  }
  return { rows: raw.map(normalizeRow), truncated: true };
}

function normalizeRow(row: FollowupRow): FollowupRow {
  return {
    ...row,
    asignadas: Number(row.asignadas),
    completadas: Number(row.completadas),
    pendientes: Array.isArray(row.pendientes) ? row.pendientes : [],
  };
}
