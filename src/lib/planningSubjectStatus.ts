import {
  normalizePlanningSubjectName,
  type PlanningSubjectRecord,
  type PlanningSubjectScope,
} from "./planningSubjectScope";

export type PlanningSubjectNpRecord = {
  subject_key: string;
  estado?: string | null;
};

export type PlanningSubjectStatus = "approved" | "np" | "pending";

/**
 * An explicit NP override applies to every group in the normalized subject scope.
 * An approved planning always wins defensively; the write RPC prevents that state.
 */
export function getPlanningSubjectStatus(
  scope: Pick<PlanningSubjectScope, "key">,
  planningRecords: readonly PlanningSubjectRecord[],
  npRecords: readonly PlanningSubjectNpRecord[],
): PlanningSubjectStatus {
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
