import { normalizeText } from "./importCsv";

/** Canonical form shared by assignment imports and reconciliation. */
export function normalizeImportedGroup(
  value: string | null | undefined,
): string {
  return normalizeText(value).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeImportedPlan(
  value: string | null | undefined,
): string {
  return normalizeText(value);
}

export function normalizeImportedSubjectKey(
  value: string | null | undefined,
): string {
  return normalizeText(value);
}

export function baseImportedGroup(value: string | null | undefined): string {
  return normalizeImportedGroup(normalizeText(value).split(" - ")[0]);
}

/**
 * Assignment identity deliberately excludes grade: a plan's group may retain grade as
 * descriptive data, but grade is not safe enough to split a persisted assignment.
 * The five-argument form remains temporarily compatible with older callers; its
 * third (grade) argument is ignored.
 */
export function assignmentImportKey(
  cycleId: number,
  plan: string | null | undefined,
  groupOrLegacyGrade: string | null | undefined,
  subjectOrLegacyGroup: string | null | undefined,
  legacySubjectKey?: string | null | undefined,
): string {
  const group =
    legacySubjectKey === undefined ? groupOrLegacyGrade : subjectOrLegacyGroup;
  const subjectKey =
    legacySubjectKey === undefined ? subjectOrLegacyGroup : legacySubjectKey;
  return [
    cycleId,
    normalizeImportedPlan(plan),
    normalizeImportedGroup(group),
    normalizeImportedSubjectKey(subjectKey),
  ].join("|");
}
