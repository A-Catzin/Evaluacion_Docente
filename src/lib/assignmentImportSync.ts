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

export type AssignmentSyncTeacher = {
  id: number;
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null;
  num_empleado?: string | null;
  activo?: boolean | null;
};

export type AssignmentSyncSubject = {
  id: number;
  clave?: string | null;
  nombre?: string | null;
};
export type AssignmentSyncGroup = {
  id: number;
  clave?: string | null;
  cuatrimestre_id?: number | null;
  docente_id?: number | null;
  asignatura_id?: number | null;
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
  subjectId: number;
  teacherId: number;
  teacherLabel: string;
  previousTeacherId: number | null;
  baseIds: number[];
  baseKey: string;
  numAlumnos: number;
  existingGroupId: number | null;
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
    blockers: number;
    issuesToResolve: number;
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

/** Pure reconciliation: preview callers can prove this function has no database writes. */
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
    if (
      !row.plan ||
      !row.group ||
      !row.subjectKey ||
      !row.subjectName ||
      !row.teacher
    ) {
      blockers.push({ row: row.row, reason: "fila_incompleta" });
      continue;
    }
    const teacherMatches = teacherCandidates(row, activeTeachers);
    if (teacherMatches.length !== 1) {
      blockers.push({
        row: row.row,
        reason: teacherMatches.length
          ? "docente_ambiguo"
          : "docente_no_encontrado",
        details: { matches: teacherMatches.length },
      });
      continue;
    }
    const subjectMatches = input.subjects.filter(
      (subject) =>
        normalizeImportedSubjectKey(subject.clave) === row.subjectKey,
    );
    if (subjectMatches.length !== 1) {
      blockers.push({
        row: row.row,
        reason: subjectMatches.length
          ? "asignatura_ambigua"
          : "asignatura_no_encontrada",
        details: { matches: subjectMatches.length },
      });
      continue;
    }

    const plan = normalizeImportedPlan(row.plan);
    const group = normalizeImportedGroup(row.group);
    // Report IDs are not necessarily public.grupos IDs. Resolve the row from its
    // canonical CSV identity first, retaining all equivalent bases for enrollment.
    const baseCandidates = input.groups.filter(
      (candidate) =>
        candidate.cuatrimestre_id === input.cycleId &&
        !candidate.asignatura_id &&
        normalizeImportedPlan(candidate.plan_normalizado) === plan &&
        normalizeImportedGroup(
          candidate.grupo_normalizado || candidate.clave,
        ) === group,
    );
    const canonicalBase =
      selectCanonicalEquivalentBaseCandidate(baseCandidates);
    if (!canonicalBase) {
      blockers.push({
        row: row.row,
        reason: baseCandidates.length
          ? "grupo_base_ambiguo"
          : "grupo_base_no_encontrado",
        details: {
          cycleId: input.cycleId,
          normalizedPlan: plan,
          normalizedGroup: group,
          csvGroupId: row.groupId || null,
          baseCandidateIds: baseCandidates.map((candidate) => candidate.id),
          baseCandidateCount: baseCandidates.length,
        },
      });
      continue;
    }

    // A database ID is only a hint. Use it when it names the same current, unassigned
    // base; subject rows and conflicting identities fall back to canonical resolution.
    const hintedId = Number(row.groupId);
    const hintedBase =
      row.groupId && Number.isSafeInteger(hintedId) && hintedId > 0
        ? input.groups.find(
            (candidate) =>
              candidate.id === hintedId &&
              candidate.cuatrimestre_id === input.cycleId &&
              !candidate.asignatura_id &&
              !candidate.docente_id &&
              normalizeImportedPlan(candidate.plan_normalizado) === plan &&
              normalizeImportedGroup(
                candidate.grupo_normalizado || candidate.clave,
              ) === group &&
              normalizeText(candidate.grado) ===
                normalizeText(canonicalBase.grado),
          )
        : undefined;
    const base = hintedBase || canonicalBase;
    const resolvedPlan = normalizeImportedPlan(base.plan_normalizado || plan);
    const resolvedGroup = normalizeImportedGroup(
      base.grupo_normalizado || base.clave || group,
    );
    const grade = normalizeText(base.grado);
    if (!resolvedPlan || !resolvedGroup || !grade) {
      blockers.push({ row: row.row, reason: "grupo_base_inseguro" });
      continue;
    }
    const key = assignmentImportKey(
      input.cycleId,
      resolvedPlan,
      grade,
      resolvedGroup,
      row.subjectKey,
    );
    const existing = input.groups.filter(
      (candidate) =>
        Boolean(candidate.asignatura_id) &&
        (candidate.importacion_key === key ||
          (candidate.asignatura_id === subjectMatches[0].id &&
            normalizeImportedPlan(candidate.plan_normalizado) ===
              resolvedPlan &&
            normalizeText(candidate.grado) === grade &&
            normalizeImportedGroup(
              candidate.grupo_normalizado || candidate.clave,
            ) === resolvedGroup)),
    );
    if (existing.length > 1) {
      blockers.push({
        row: row.row,
        reason: "asignacion_duplicada",
        details: { ids: existing.map((candidate) => candidate.id) },
      });
      continue;
    }
    const issueCount = input.openIssues.filter(
      (issue) =>
        normalizeImportedPlan(issue.plan) === resolvedPlan &&
        normalizeImportedGroup(issue.grupo) === resolvedGroup &&
        normalizeImportedSubjectKey(issue.clave_asignatura) === row.subjectKey,
    ).length;
    const prior = actions.get(key);
    if (prior) {
      if (prior.teacherId === teacherMatches[0].id) prior.rows.push(row.row);
      else
        blockers.push({
          row: row.row,
          reason: "csv_asignacion_docente_conflictiva",
          details: { firstRow: prior.row },
        });
      continue;
    }
    const current = existing[0] || null;
    actions.set(key, {
      row: row.row,
      rows: [row.row],
      kind: current
        ? current.docente_id === teacherMatches[0].id
          ? "no-op"
          : "update"
        : "create",
      assignmentKey: key,
      plan: resolvedPlan,
      grade,
      group: resolvedGroup,
      subjectKey: row.subjectKey,
      subjectId: subjectMatches[0].id,
      teacherId: teacherMatches[0].id,
      teacherLabel: teacherLabel(teacherMatches[0]),
      previousTeacherId: current?.docente_id || null,
      baseIds: baseCandidates
        .map((candidate) => candidate.id)
        .sort((a, b) => a - b),
      baseKey: base.clave || resolvedGroup.slice(0, 20),
      numAlumnos: base.num_alumnos || 0,
      existingGroupId: current?.id || null,
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
      blockers: blockers.length,
      issuesToResolve: result.reduce(
        (total, action) => total + action.issueCount,
        0,
      ),
    },
  };
}
