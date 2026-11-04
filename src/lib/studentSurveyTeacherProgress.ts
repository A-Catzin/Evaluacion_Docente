export type TeacherGroupProgress = {
  docente_id: number;
  docente: string;
  docente_activo: boolean;
  grupo_id: number;
  grupo: string;
  materia: string;
  elegibles: number;
  respondidas: number;
};

export type SubjectProgress = { materia: string; groups: string[]; eligible: number; answered: number; progress: number };
export type TeacherProgress = {
  id: number;
  name: string;
  active: boolean;
  eligible: number;
  answered: number;
  progress: number;
  subjects: SubjectProgress[];
};

export const TEACHER_PROGRESS_STATES = {
  todos: 'Todos',
  pendientes: 'Con pendientes',
  sin_respuestas: 'Sin respuestas',
  completos: 'Completos',
} as const;
export type TeacherProgressState = keyof typeof TEACHER_PROGRESS_STATES;
export type TeacherProgressFilters = { q: string; state: TeacherProgressState };

const percent = (answered: number, eligible: number) => (eligible ? (answered / eligible) * 100 : 0);

/** Groups of the same subject are merged so a teacher sees one bar per subject. */
export function buildTeacherProgress(rows: TeacherGroupProgress[]): TeacherProgress[] {
  const teachers = new Map<number, TeacherProgress & { bySubject: Map<string, SubjectProgress> }>();
  for (const row of rows) {
    const eligible = Number(row.elegibles);
    const answered = Number(row.respondidas);
    let teacher = teachers.get(row.docente_id);
    if (!teacher) {
      teacher = {
        id: row.docente_id, name: row.docente, active: row.docente_activo,
        eligible: 0, answered: 0, progress: 0, subjects: [], bySubject: new Map(),
      };
      teachers.set(row.docente_id, teacher);
    }
    teacher.eligible += eligible;
    teacher.answered += answered;
    let subject = teacher.bySubject.get(row.materia);
    if (!subject) {
      subject = { materia: row.materia, groups: [], eligible: 0, answered: 0, progress: 0 };
      teacher.bySubject.set(row.materia, subject);
      teacher.subjects.push(subject);
    }
    subject.eligible += eligible;
    subject.answered += answered;
    if (!subject.groups.includes(row.grupo)) subject.groups.push(row.grupo);
  }
  return [...teachers.values()].map(({ bySubject: _unused, ...teacher }) => {
    for (const subject of teacher.subjects) subject.progress = percent(subject.answered, subject.eligible);
    teacher.subjects.sort((a, b) => a.progress - b.progress || a.materia.localeCompare(b.materia, 'es'));
    return { ...teacher, progress: percent(teacher.answered, teacher.eligible) };
  }).sort((a, b) => a.progress - b.progress || a.name.localeCompare(b.name, 'es'));
}

export function parseTeacherProgressFilters(params: URLSearchParams): TeacherProgressFilters {
  const state = params.get('estado') ?? '';
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    state: state in TEACHER_PROGRESS_STATES ? (state as TeacherProgressState) : 'todos',
  };
}

const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterTeacherProgress(teachers: TeacherProgress[], filters: TeacherProgressFilters): TeacherProgress[] {
  const needle = fold(filters.q);
  return teachers.filter((teacher) => {
    if (needle && !fold(`${teacher.name} ${teacher.subjects.map((s) => s.materia).join(' ')}`).includes(needle)) return false;
    switch (filters.state) {
      case 'pendientes': return teacher.answered < teacher.eligible;
      case 'sin_respuestas': return teacher.eligible > 0 && teacher.answered === 0;
      case 'completos': return teacher.eligible > 0 && teacher.answered === teacher.eligible;
      default: return true;
    }
  });
}

export function summarizeTeacherProgress(teachers: TeacherProgress[]) {
  const eligible = teachers.reduce((sum, t) => sum + t.eligible, 0);
  const answered = teachers.reduce((sum, t) => sum + t.answered, 0);
  return {
    teachers: teachers.length,
    complete: teachers.filter((t) => t.eligible > 0 && t.answered === t.eligible).length,
    withoutResponses: teachers.filter((t) => t.eligible > 0 && t.answered === 0).length,
    eligible,
    answered,
    progress: percent(answered, eligible),
  };
}

export const TEACHER_PROGRESS_BLOCK_SIZE = 1000;
export const TEACHER_PROGRESS_MAX_ROWS = 5000;

type RangedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => {
    range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

// PostgREST caps every response at 1000 rows, so the RPC is read in ranged blocks.
export async function fetchTeacherProgress(client: RangedRpc, cycleId: number): Promise<TeacherGroupProgress[]> {
  const rows: TeacherGroupProgress[] = [];
  for (let from = 0; from < TEACHER_PROGRESS_MAX_ROWS; from += TEACHER_PROGRESS_BLOCK_SIZE) {
    const { data, error } = await client
      .rpc('admin_avance_encuestas_docentes', { p_cuatrimestre_id: cycleId })
      .range(from, from + TEACHER_PROGRESS_BLOCK_SIZE - 1);
    if (error) throw error;
    const block = (data || []) as TeacherGroupProgress[];
    rows.push(...block);
    if (block.length < TEACHER_PROGRESS_BLOCK_SIZE) return rows;
  }
  return rows;
}
