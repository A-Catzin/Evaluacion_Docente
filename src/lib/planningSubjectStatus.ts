import {
  normalizePlanningSubjectName,
  type PlanningSubjectRecord,
  type PlanningSubjectScope,
} from "./planningSubjectScope";

export type PlanningSubjectNpRecord = {
  subject_key: string;
  estado?: string | null;
};

export type PlanningGroupNpRecord = {
  grupo_id: number;
  estado?: string | null;
};

export type PlanningSubjectStatus = "approved" | "np" | "pending";

/**
 * Subject NP applies to every normalized assignment. A documented approved plan
 * wins over that impossible combination, but group NP is an independent
 * administrative exclusion and wins when every active group is marked NP.
 */
export function getPlanningSubjectStatus(
  scope: Pick<PlanningSubjectScope, "key" | "assignments">,
  planningRecords: readonly PlanningSubjectRecord[],
  npRecords: readonly PlanningSubjectNpRecord[],
  groupNpRecords: readonly PlanningGroupNpRecord[] = [],
): PlanningSubjectStatus {
  const npGroupIds = new Set(
    groupNpRecords
      .filter((record) => record.estado === "NP")
      .map((record) => Number(record.grupo_id)),
  );
  const allActiveAssignmentsAreNp =
    scope.assignments.length > 0 &&
    scope.assignments.every(
      (assignment) =>
        assignment.grupoId != null && npGroupIds.has(assignment.grupoId),
    );
  if (allActiveAssignmentsAreNp) return "np";

  const hasApprovedPlanning = planningRecords.some(
    (record) =>
      normalizePlanningSubjectName(record.asignaturaNombre) === scope.key &&
      record.estado === "Aprobado",
  );
  if (hasApprovedPlanning) return "approved";

  return npRecords.some(
    (record) =>
      normalizePlanningSubjectName(record.subject_key) === scope.key &&
      record.estado === "NP",
  )
    ? "np"
    : "pending";
}

export function isPlanningSubjectMarkedNp(
  subjectName: string,
  npRecords: readonly PlanningSubjectNpRecord[],
): boolean {
  const key = normalizePlanningSubjectName(subjectName);
  return npRecords.some(
    (record) =>
      normalizePlanningSubjectName(record.subject_key) === key &&
      record.estado === "NP",
  );
}
