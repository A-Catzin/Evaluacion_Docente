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

export function assignmentImportKey(
  cycleId: number,
  plan: string | null | undefined,
  grade: string | null | undefined,
  group: string | null | undefined,
  subjectKey: string | null | undefined,
): string {
  return [
    cycleId,
    normalizeImportedPlan(plan),
    normalizeText(grade),
    normalizeImportedGroup(group),
    normalizeImportedSubjectKey(subjectKey),
  ].join("|");
}
