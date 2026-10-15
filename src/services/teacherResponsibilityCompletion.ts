export type PlanningCompletionStatus =
  | "complete"
  | "partial"
  | "none"
  | "np"
  | "not_applicable";
export type GlobalCompletionStatus = "both" | "one" | "none";
export type CompletionFilter = "all" | "complete" | "none";
export type PlanningFilter = "all" | PlanningCompletionStatus;
export type GlobalFilter = "all" | GlobalCompletionStatus;

export type TeacherResponsibilityCompletionRow = {
  docenteId: number;
  nombre: string;
  apellidos: string;
  email: string;
  coordinators: string[];
  autodiagnosticoCompleted: boolean;
  autodiagnosticoCompletedAt: string | null;
  planningStatus: PlanningCompletionStatus;
  planningSubjectCount: number;
  planningSubmittedCount: number;
  planningNpSubjectCount: number;
  planningNpGroupCount: number;
  planningGroupCount: number;
  planningLastSubmittedAt: string | null;
  planningPlanId: number | null;
  globalStatus: GlobalCompletionStatus;
};

export type TeacherResponsibilityFilters = {
  query?: string;
  autodiagnostico?: CompletionFilter;
  planning?: PlanningFilter;
  global?: GlobalFilter;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Respuesta de cumplimiento docente inválida.");
  }
  return value as Record<string, unknown>;
}

function requiredInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Campo inválido en cumplimiento docente: ${field}.`);
  }
  return number;
}

function nullableInteger(value: unknown, field: string): number | null {
  if (value == null) return null;
  return requiredInteger(value, field);
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error(`Campo inválido en cumplimiento docente: ${field}.`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  const result = nullableString(value, field);
  if (result === null) throw new Error(`Campo inválido en cumplimiento docente: ${field}.`);
  return result;
}

function planningStatus(value: unknown): PlanningCompletionStatus {
  if (["complete", "partial", "none", "np", "not_applicable"].includes(String(value))) {
    return value as PlanningCompletionStatus;
  }
  throw new Error("Estado de planeación inválido en cumplimiento docente.");
}

function globalStatus(
  autodiagnosticoCompleted: boolean,
  planning: PlanningCompletionStatus,
): GlobalCompletionStatus {
  const completedResponsibilities =
    Number(autodiagnosticoCompleted) + Number(planning === "complete" || planning === "np");
  if (completedResponsibilities === 2) return "both";
  if (completedResponsibilities === 1) return "one";
  return "none";
}

/** Maps the RPC contract and rejects malformed aggregation results fail-closed. */
export function mapTeacherResponsibilityCompletionRows(
  value: unknown,
): TeacherResponsibilityCompletionRow[] {
  if (!Array.isArray(value)) {
    throw new Error("Respuesta de cumplimiento docente inválida.");
  }
  return value.map((item) => {
    const row = asRecord(item);
    if (typeof row.autodiagnostico_completed !== "boolean") {
      throw new Error("Estado de autodiagnóstico inválido en cumplimiento docente.");
    }
    const status = planningStatus(row.planning_status);
    return {
      docenteId: requiredInteger(row.docente_id, "docente_id"),
      nombre: requiredString(row.docente_nombre, "docente_nombre"),
      apellidos: requiredString(row.docente_apellidos, "docente_apellidos"),
          email: requiredString(row.docente_email, "docente_email"),
          coordinators: (() => {
            if (!Array.isArray(row.coordinators) || !row.coordinators.every((name) => typeof name === "string")) {
              throw new Error("Coordinaciones inválidas en cumplimiento docente.");
            }
            return row.coordinators as string[];
          })(),
      autodiagnosticoCompleted: row.autodiagnostico_completed,
      autodiagnosticoCompletedAt: nullableString(
        row.autodiagnostico_completed_at,
        "autodiagnostico_completed_at",
      ),
      planningStatus: status,
      planningSubjectCount: requiredInteger(row.planning_subject_count, "planning_subject_count"),
      planningSubmittedCount: requiredInteger(row.planning_submitted_count, "planning_submitted_count"),
      planningNpSubjectCount: requiredInteger(row.planning_np_subject_count, "planning_np_subject_count"),
      planningNpGroupCount: requiredInteger(row.planning_np_group_count, "planning_np_group_count"),
      planningGroupCount: requiredInteger(row.planning_group_count, "planning_group_count"),
      planningLastSubmittedAt: nullableString(
        row.planning_last_submitted_at,
        "planning_last_submitted_at",
      ),
      planningPlanId: nullableInteger(row.planning_plan_id, "planning_plan_id"),
      globalStatus: globalStatus(row.autodiagnostico_completed, status),
    };
  });
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX");
}

export function filterTeacherResponsibilityRows(
  rows: readonly TeacherResponsibilityCompletionRow[],
  filters: TeacherResponsibilityFilters,
): TeacherResponsibilityCompletionRow[] {
  const query = normalizedText(filters.query?.trim() || "");
  return rows.filter((row) => {
    const matchesQuery = !query || normalizedText(
      `${row.nombre} ${row.apellidos} ${row.email}`,
    ).includes(query);
    const matchesAutodiagnostico = !filters.autodiagnostico
      || filters.autodiagnostico === "all"
      || (filters.autodiagnostico === "complete" && row.autodiagnosticoCompleted)
      || (filters.autodiagnostico === "none" && !row.autodiagnosticoCompleted);
    const matchesPlanning = !filters.planning
      || filters.planning === "all"
      || filters.planning === row.planningStatus;
    const matchesGlobal = !filters.global
      || filters.global === "all"
      || filters.global === row.globalStatus;
    return matchesQuery && matchesAutodiagnostico && matchesPlanning && matchesGlobal;
  });
}

export function paginateTeacherResponsibilityRows(
  rows: readonly TeacherResponsibilityCompletionRow[],
  requestedPage: number,
  pageSize = 25,
) {
  const total = rows.length;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 25;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(
    Math.max(Number.isSafeInteger(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  );
  const start = (currentPage - 1) * safePageSize;
  return { rows: rows.slice(start, start + safePageSize), total, totalPages, currentPage };
}
