import {
  assignmentImportKey,
  baseImportedGroup,
  normalizeImportedGroup,
  normalizeImportedPlan,
  normalizeImportedSubjectKey,
} from "./groupImportIdentity";
import {
  findColumn,
  normalizeEmployeeNumber,
  normalizeText,
  parseCsv,
} from "./importCsv";
import { selectCanonicalEquivalentBaseCandidate } from "./groupImportResolution";

export type AssignmentSyncRow = {
  row: number;
  plan: string;
  group: string;
  groupId: string;
  subjectKey: string;
  subjectName: string;
  teacher: string;
  teacherEmail: string;
  teacherEmployee: string;
};

type RuntimeId = number | string | null | undefined;

export type AssignmentSyncTeacher = {
  id: number | string;
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null;
  num_empleado?: string | null;
  activo?: boolean | null;
};
export type AssignmentSyncSubject = {
  id: number | string;
  clave?: string | null;
  nombre?: string | null;
};
export type AssignmentSyncGroup = {
  id: number | string;
  clave?: string | null;
  cuatrimestre_id?: RuntimeId;
  docente_id?: RuntimeId;
  asignatura_id?: RuntimeId;
  num_alumnos?: number | null;
  plan_normalizado?: string | null;
  grado?: string | null;
  grupo_normalizado?: string | null;
  importacion_key?: string | null;
};
export type AssignmentSyncOpenIssue = {
  id: number;
  plan?: string | null;
  grupo?: string | null;
  clave_asignatura?: string | null;
};
export type AssignmentSyncBlocker = {
  row: number;
  reason: string;
  details?: Record<string, unknown>;
};
export type AssignmentSyncAction = {
  row: number;
  rows: number[];
  kind: "create" | "update" | "no-op";
  assignmentKey: string;
  plan: string;
  grade: string;
  group: string;
  subjectKey: string;
  subjectName: string;
  subjectId: number | null;
  subjectAction: "create" | "existing";
  teacherId: number;
  teacherLabel: string;
  previousTeacherId: number | null;
  baseIds: number[];
  baseKey: string;
  numAlumnos: number;
  existingGroupId: number | null;
  groupAction: "create" | "existing";
  issueCount: number;
};
export type AssignmentSyncPlan = {
  rowsRead: number;
  actions: AssignmentSyncAction[];
  blockers: AssignmentSyncBlocker[];
  warnings: AssignmentSyncBlocker[];
  summary: {
    create: number;
    update: number;
    noOp: number;
    subjectsCreated: number;
    groupsCreated: number;
    blockers: number;
    issuesToResolve: number;
    issuesToClean: number;
    warningCount: number;
  };
};

export function parseAssignmentSyncCsv(text: string): {
  rows: AssignmentSyncRow[];
  blockers: AssignmentSyncBlocker[];
} {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  if (records.length < 2)
    return { rows: [], blockers: [{ row: 1, reason: "archivo_vacio" }] };
  const headers = records[0];
  const columns = {
    plan: findColumn(headers, "Plan de Estudios", "PLAN DE ESTUDIOS"),
    group: findColumn(headers, "Grupo"),
    groupId: findColumn(headers, "ID del grupo"),
    subjectKey: findColumn(headers, "Clave", "CLAVE"),
    subjectName: findColumn(headers, "Clase", "Nombre de la clase"),
    teacher: findColumn(headers, "Docente", "Nombre del docente"),
    teacherEmail: findColumn(
      headers,
      "Correo del docente",
      "Correo docente",
      "Email docente",
    ),
    teacherEmployee: findColumn(
      headers,
      "Número de empleado",
      "Numero de empleado",
      "Num empleado",
    ),
  };
  if (
    [
      columns.plan,
      columns.group,
      columns.subjectKey,
      columns.subjectName,
      columns.teacher,
    ].some((column) => column < 0)
  ) {
    return {
      rows: [],
      blockers: [
        {
          row: 1,
          reason: "contrato_invalido",
          details: {
            required: "Plan de Estudios, Grupo, Clave, Clase y Docente",
          },
        },
      ],
    };
  }
  const value = (record: string[], column: number) =>
    column >= 0 ? (record[column] || "").trim() : "";
  return {
    rows: records.slice(1).map((record, offset) => ({
      row: offset + 2,
      plan: value(record, columns.plan),
      group: baseImportedGroup(value(record, columns.group)),
      groupId: value(record, columns.groupId),
      subjectKey: normalizeImportedSubjectKey(
        value(record, columns.subjectKey),
      ),
      subjectName: normalizeText(value(record, columns.subjectName)),
      teacher: normalizeText(value(record, columns.teacher)),
      teacherEmail: value(record, columns.teacherEmail).toLowerCase(),
      teacherEmployee: normalizeEmployeeNumber(
        value(record, columns.teacherEmployee),
      ),
    })),
    blockers: [],
  };
}

function numericId(value: RuntimeId): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function sameId(left: RuntimeId, right: RuntimeId): boolean {
  const normalized = numericId(left);
  return normalized !== null && normalized === numericId(right);
}
function teacherCandidates(
  row: AssignmentSyncRow,
  teachers: AssignmentSyncTeacher[],
) {
  if (row.teacherEmail)
    return teachers.filter(
      (teacher) =>
        String(teacher.email || "")
          .trim()
          .toLowerCase() === row.teacherEmail,
    );
  if (row.teacherEmployee)
    return teachers.filter(
      (teacher) =>
        normalizeEmployeeNumber(teacher.num_empleado) === row.teacherEmployee,
    );
  const names = row.teacher
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
  if (names.some((name) => name.includes("@")))
    return teachers.filter((teacher) =>
      names.includes(
        String(teacher.email || "")
          .trim()
          .toLowerCase(),
      ),
    );
  return teachers.filter((teacher) => {
    const direct = normalizeText(
      `${teacher.nombre || ""} ${teacher.apellidos || ""}`,
    );
    const reversed = normalizeText(
      `${teacher.apellidos || ""} ${teacher.nombre || ""}`,
    );
    return row.teacher === direct || row.teacher === reversed;
  });
}
function teacherLabel(teacher: AssignmentSyncTeacher) {
  return (
    `${teacher.nombre || ""} ${teacher.apellidos || ""}`.trim() ||
    teacher.email ||
    `Docente ${teacher.id}`
  );
}

/** Pure, read-only reconciliation for the preview and apply revalidation. */
export function planAssignmentImportSync(input: {
  cycleId: number;
  rows: AssignmentSyncRow[];
  initialBlockers?: AssignmentSyncBlocker[];
  teachers: AssignmentSyncTeacher[];
  subjects: AssignmentSyncSubject[];
  groups: AssignmentSyncGroup[];
  openIssues: AssignmentSyncOpenIssue[];
}): AssignmentSyncPlan {
  const blockers = [...(input.initialBlockers || [])];
  const warnings: AssignmentSyncBlocker[] = [];
  const actions = new Map<string, AssignmentSyncAction>();
  const activeTeachers = input.teachers.filter(
    (teacher) => teacher.activo !== false,
  );

  for (const row of input.rows) {
    const missingFields = [
      ["plan", row.plan],
      ["group", row.group],
      ["subjectKey", row.subjectKey],
      ["subjectName", row.subjectName],
      ["teacher", row.teacher],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);
    if (missingFields.length) {
      warnings.push({
        row: row.row,
        reason: "fila_incompleta",
        details: { missingFields },
      });
      continue;
    }
    const teacherMatches = teacherCandidates(row, activeTeachers);
    if (
      teacherMatches.length !== 1 ||
      numericId(teacherMatches[0]?.id) === null
    ) {
      blockers.push({
        row: row.row,
        reason:
          teacherMatches.length > 1
            ? "docente_ambiguo"
            : "docente_no_encontrado",
        details: { matches: teacherMatches.length },
      });
      continue;
    }
    const teacherId = numericId(teacherMatches[0].id)!;
    const plan = normalizeImportedPlan(row.plan);
    const group = normalizeImportedGroup(row.group);
    const subjectMatches = input.subjects.filter(
      (subject) =>
        normalizeImportedSubjectKey(subject.clave) === row.subjectKey,
    );
    if (subjectMatches.length > 1) {
      blockers.push({
        row: row.row,
        reason: "asignatura_ambigua",
        details: { matches: subjectMatches.length },
      });
      continue;
    }
    const subjectId =
      subjectMatches.length === 1 ? numericId(subjectMatches[0].id) : null;
    if (subjectMatches.length === 1 && subjectId === null) {
      blockers.push({
        row: row.row,
        reason: "asignatura_ambigua",
        details: { matches: 1 },
      });
      continue;
    }
    const key = assignmentImportKey(input.cycleId, plan, group, row.subjectKey);
    const existing = input.groups.filter(
      (candidate) =>
        sameId(candidate.cuatrimestre_id, input.cycleId) &&
        numericId(candidate.asignatura_id) !== null &&
        (candidate.importacion_key === key ||
          (subjectId !== null &&
            sameId(candidate.asignatura_id, subjectId) &&
            normalizeImportedPlan(candidate.plan_normalizado) === plan &&
            normalizeImportedGroup(
              candidate.grupo_normalizado || candidate.clave,
            ) === group)),
    );
    if (existing.length > 1) {
      blockers.push({
        row: row.row,
        reason: "asignacion_duplicada",
        details: { ids: existing.map((candidate) => candidate.id) },
      });
      continue;
    }
    const baseCandidates = input.groups.filter(
      (candidate) =>
        sameId(candidate.cuatrimestre_id, input.cycleId) &&
        numericId(candidate.asignatura_id) === null &&
        normalizeImportedPlan(candidate.plan_normalizado) === plan &&
        normalizeImportedGroup(
          candidate.grupo_normalizado || candidate.clave,
        ) === group,
    );
    const validBaseCandidates = baseCandidates.flatMap((candidate) => {
      const id = numericId(candidate.id);
      return id === null ? [] : [{ ...candidate, id }];
    });
    const base = selectCanonicalEquivalentBaseCandidate(validBaseCandidates);
    if (
      !existing.length &&
      (baseCandidates.length > 1 ||
        validBaseCandidates.length !== baseCandidates.length)
    ) {
      blockers.push({
        row: row.row,
        reason: "grupo_base_ambiguo",
        details: { ids: baseCandidates.map((candidate) => candidate.id) },
      });
      continue;
    }
    const prior = actions.get(key);
    if (prior) {
      if (
        prior.teacherId === teacherId &&
        prior.subjectName === row.subjectName
      ) {
        prior.rows.push(row.row);
      } else {
        blockers.push({
          row: row.row,
          reason:
            prior.teacherId === teacherId
              ? "csv_asignacion_conflictiva"
              : "csv_asignacion_docente_conflictiva",
          details: { firstRow: prior.row },
        });
      }
      continue;
    }
    const current = existing[0];
    const baseId = base ? numericId(base.id) : null;
    const issueCount = input.openIssues.filter(
      (issue) =>
        normalizeImportedPlan(issue.plan) === plan &&
        normalizeImportedGroup(issue.grupo) === group &&
        normalizeImportedSubjectKey(issue.clave_asignatura) === row.subjectKey,
    ).length;
    actions.set(key, {
      row: row.row,
      rows: [row.row],
      kind: current
        ? sameId(current.docente_id, teacherId)
          ? "no-op"
          : "update"
        : "create",
      assignmentKey: key,
      plan,
      grade: normalizeText(base?.grado),
      group,
      subjectKey: row.subjectKey,
      subjectName: row.subjectName,
      subjectId,
      subjectAction: subjectId === null ? "create" : "existing",
      teacherId,
      teacherLabel: teacherLabel(teacherMatches[0]),
      previousTeacherId: numericId(current?.docente_id),
      baseIds: baseId === null ? [] : [baseId],
      baseKey: base?.clave || group.slice(0, 20),
      numAlumnos: base?.num_alumnos || 0,
      existingGroupId: numericId(current?.id),
      groupAction: baseId === null && !current ? "create" : "existing",
      issueCount,
    });
  }
  const result = [...actions.values()];
  return {
    rowsRead: input.rows.length,
    actions: result,
    blockers,
    warnings,
    summary: {
      create: result.filter((action) => action.kind === "create").length,
      update: result.filter((action) => action.kind === "update").length,
      noOp: result.filter((action) => action.kind === "no-op").length,
      subjectsCreated: new Set(
        result
          .filter((action) => action.subjectAction === "create")
          .map((action) => action.subjectKey),
      ).size,
      groupsCreated: result.filter((action) => action.groupAction === "create")
        .length,
      blockers: blockers.length,
      issuesToResolve: result.reduce(
        (total, action) => total + action.issueCount,
        0,
      ),
      issuesToClean: input.openIssues.length,
      warningCount: warnings.length,
    },
  };
}
