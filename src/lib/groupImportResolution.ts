import {
  normalizeImportedGroup,
  normalizeImportedPlan,
} from "./groupImportIdentity";
import { normalizeText } from "./importCsv";

type BaseGroupCandidate = {
  id: number;
  cuatrimestre_id?: number | string | null;
  clave?: string | null;
  docente_id?: number | null;
  asignatura_id?: number | null;
  plan_normalizado?: string | null;
  grado?: string | null;
  grupo_normalizado?: string | null;
};

function normalizedCycle(value: number | string | null | undefined): string {
  return normalizeText(
    value === null || value === undefined ? "" : String(value),
  );
}

/**
 * Selects a stable representative only for duplicate, unassigned base rows with
 * the same normalized identity. Distinct or already-assigned rows stay ambiguous.
 */
export function selectCanonicalEquivalentBaseCandidate<
  T extends BaseGroupCandidate,
>(candidates: T[]): T | undefined {
  if (!candidates.length) return undefined;

  const identity = (candidate: T) =>
    [
      normalizedCycle(candidate.cuatrimestre_id),
      normalizeImportedPlan(candidate.plan_normalizado),
      normalizeText(candidate.grado),
      normalizeImportedGroup(candidate.grupo_normalizado || candidate.clave),
    ].join("|");
  const firstIdentity = identity(candidates[0]);
  if (
    candidates.some(
      (candidate) =>
        candidate.asignatura_id != null ||
        candidate.docente_id != null ||
        identity(candidate) !== firstIdentity,
    )
  )
    return undefined;

  return candidates.reduce((lowest, candidate) =>
    candidate.id < lowest.id ? candidate : lowest,
  );
}

export function selectUniqueGroupCandidate<T>(candidates: T[]): T | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}
