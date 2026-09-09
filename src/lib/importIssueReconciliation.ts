import {
  assignmentImportKey,
  normalizeImportedGroup,
  normalizeImportedPlan,
  normalizeImportedSubjectKey,
} from "./groupImportIdentity";
import { normalizeText } from "./importCsv";
import { selectCanonicalEquivalentBaseCandidate } from "./groupImportResolution";

export type ImportIssueTarget = {
  id?: number;
  plan: string | null | undefined;
  grupo: string | null | undefined;
  clave_asignatura: string | null | undefined;
};

export type ReconciliationGroup = {
  id: number;
  clave?: string | null;
  cuatrimestre_id?: number | null;
  docente_id?: number | null;
  asignatura_id?: number | null;
  plan_normalizado?: string | null;
  grado?: string | null;
  grupo_normalizado?: string | null;
  importacion_key?: string | null;
  num_alumnos?: number | null;
  asignaturas?: { clave?: string | null } | { clave?: string | null }[] | null;
};

type Subject = { id: number; clave: string | null };

export type ResolvedImportIssueTarget = {
  ok: true;
  plan: string;
  group: string;
  subjectKey: string;
  subject: Subject;
  base: ReconciliationGroup;
  baseIds: number[];
  assignmentKey: string;
  existing: ReconciliationGroup | null;
};

export type UnresolvedImportIssueTarget = {
  ok: false;
  code:
    | "import_issue_assignment_subject_not_found"
    | "import_issue_assignment_subject_ambiguous"
    | "import_issue_assignment_plan_ambiguous"
    | "import_issue_assignment_grade_ambiguous"
    | "import_issue_assignment_base_ambiguous"
    | "import_issue_assignment_base_not_found"
    | "import_issue_assignment_group_ambiguous";
};

function subjectKeyForGroup(group: ReconciliationGroup): string {
  const subject = Array.isArray(group.asignaturas)
    ? group.asignaturas[0]
    : group.asignaturas;
  return normalizeImportedSubjectKey(subject?.clave);
}

/**
 * Resolves a reported assignment without ever treating a base group as its subject
 * assignment. Group-only fallback is retained only when it identifies one plan.
 */
export function resolveImportIssueTarget(
  cycleId: number,
  issue: ImportIssueTarget,
  groups: ReconciliationGroup[],
  subjects: Subject[],
): ResolvedImportIssueTarget | UnresolvedImportIssueTarget {
  const plan = normalizeImportedPlan(issue.plan);
  const group = normalizeImportedGroup(issue.grupo);
  const subjectKey = normalizeImportedSubjectKey(issue.clave_asignatura);
  const subjectCandidates = subjects.filter(
    (subject) => normalizeImportedSubjectKey(subject.clave) === subjectKey,
  );
  if (subjectCandidates.length === 0)
    return { ok: false, code: "import_issue_assignment_subject_not_found" };
  if (subjectCandidates.length > 1)
    return { ok: false, code: "import_issue_assignment_subject_ambiguous" };

  let groupCandidates = groups.filter(
    (candidate) =>
      normalizeImportedPlan(candidate.plan_normalizado) === plan &&
      normalizeImportedGroup(candidate.grupo_normalizado || candidate.clave) ===
        group,
  );
  if (groupCandidates.length === 0) {
    groupCandidates = groups.filter(
      (candidate) =>
        normalizeImportedGroup(
          candidate.grupo_normalizado || candidate.clave,
        ) === group,
    );
    if (groupCandidates.length === 0)
      return { ok: false, code: "import_issue_assignment_base_not_found" };
    const plans = new Set(
      groupCandidates
        .map((candidate) => normalizeImportedPlan(candidate.plan_normalizado))
        .filter(Boolean),
    );
    if (
      plans.size !== 1 ||
      groupCandidates.some(
        (candidate) => !normalizeImportedPlan(candidate.plan_normalizado),
      )
    )
      return { ok: false, code: "import_issue_assignment_plan_ambiguous" };
  }

  const grades = new Set(
    groupCandidates
      .map((candidate) => normalizeText(candidate.grado))
      .filter(Boolean),
  );
  if (grades.size > 1)
    return { ok: false, code: "import_issue_assignment_grade_ambiguous" };

  const baseCandidates = groupCandidates.filter(
    (candidate) => !candidate.asignatura_id,
  );
  if (baseCandidates.length === 0)
    return { ok: false, code: "import_issue_assignment_base_not_found" };
  const base = selectCanonicalEquivalentBaseCandidate(baseCandidates);
  if (!base)
    return { ok: false, code: "import_issue_assignment_base_ambiguous" };
  const assignmentKey = assignmentImportKey(
    cycleId,
    plan,
    base.grado,
    group,
    subjectKey,
  );
  const existingCandidates = groups.filter(
    (candidate) =>
      candidate.importacion_key === assignmentKey ||
      (candidate.asignatura_id === subjectCandidates[0].id &&
        normalizeImportedPlan(candidate.plan_normalizado) === plan &&
        normalizeImportedGroup(
          candidate.grupo_normalizado || candidate.clave,
        ) === group),
  );
  if (existingCandidates.length > 1)
    return { ok: false, code: "import_issue_assignment_group_ambiguous" };

  return {
    ok: true,
    plan,
    group,
    subjectKey,
    subject: subjectCandidates[0],
    base,
    baseIds: baseCandidates.map((candidate) => candidate.id),
    assignmentKey,
    existing: existingCandidates[0] || null,
  };
}

export function assignmentPayload(
  cycleId: number,
  target: ResolvedImportIssueTarget,
  teacherId: number,
): Record<string, unknown> {
  return {
    clave: target.base.clave || target.group.slice(0, 20),
    cuatrimestre_id: cycleId,
    asignatura_id: target.subject.id,
    docente_id: teacherId,
    plan_normalizado: target.plan,
    grado: target.base.grado || null,
    grupo_normalizado: target.group,
    num_alumnos: target.base.num_alumnos || 0,
    activo: true,
    importacion_key: target.assignmentKey,
  };
}

/** A stale issue is hidden only when precisely one assigned subject group matches. */
export function assignedSubjectGroupForIssue(
  issue: ImportIssueTarget,
  groups: ReconciliationGroup[],
): ReconciliationGroup | null {
  const plan = normalizeImportedPlan(issue.plan);
  const group = normalizeImportedGroup(issue.grupo);
  const subjectKey = normalizeImportedSubjectKey(issue.clave_asignatura);
  const candidates = groups.filter(
    (candidate) =>
      Boolean(candidate.asignatura_id) &&
      normalizeImportedPlan(candidate.plan_normalizado) === plan &&
      normalizeImportedGroup(candidate.grupo_normalizado || candidate.clave) ===
        group &&
      subjectKeyForGroup(candidate) === subjectKey,
  );
  return candidates.length === 1 && candidates[0].docente_id
    ? candidates[0]
    : null;
}

export async function revalidateOpenAssignmentIssues(
  client: any,
  cycleId: number,
) {
  const { data: issues, error: issuesError } = await client
    .from("import_issues")
    .select("id,plan,grupo,clave_asignatura,import_runs!inner(tipo)")
    .eq("cuatrimestre_id", cycleId)
    .eq("resolution_status", "open")
    .eq("import_runs.tipo", "asignaciones");
  if (issuesError)
    throw new Error(
      `No se pudieron consultar incidencias abiertas: ${issuesError.message}`,
    );

  const { data: groups, error: groupsError } = await client
    .from("grupos")
    .select(
      "id,clave,cuatrimestre_id,docente_id,asignatura_id,plan_normalizado,grado,grupo_normalizado,importacion_key,asignaturas(clave)",
    )
    .eq("cuatrimestre_id", cycleId)
    .eq("activo", true);
  if (groupsError)
    throw new Error(
      `No se pudieron consultar grupos para conciliación: ${groupsError.message}`,
    );

  const issueIdsByGroup = new Map<number, number[]>();
  for (const issue of issues || []) {
    const group = assignedSubjectGroupForIssue(issue, groups || []);
    if (!group) continue;
    issueIdsByGroup.set(group.id, [
      ...(issueIdsByGroup.get(group.id) || []),
      issue.id,
    ]);
  }

  let resolved = 0;
  for (const [groupId, issueIds] of issueIdsByGroup) {
    const { error } = await client
      .from("import_issues")
      .update({
        resolution_status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: null,
        resolution_kind: "assignment_import_revalidation",
        resolved_group_id: groupId,
      })
      .in("id", issueIds)
      .eq("cuatrimestre_id", cycleId)
      .eq("resolution_status", "open");
    if (error)
      throw new Error(
        `No se pudieron resolver incidencias conciliadas: ${error.message}`,
      );
    resolved += issueIds.length;
  }
  return resolved;
}
