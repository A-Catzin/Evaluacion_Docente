import {
 normalizeImportedGroup,
 normalizeImportedPlan,
} from "./groupImportIdentity";

type BaseGroupCandidate = {
 id: number;
 cuatrimestre_id?: number | string | null;
 clave?: string | null;
 asignatura_id?: number | string | null;
 plan_normalizado?: string | null;
 grupo_normalizado?: string | null;
};

/**
 * A base group is safe only when there is exactly one persisted row for the
 * cycle/plan/group identity. Grade is descriptive and intentionally excluded.
 */
export function selectCanonicalEquivalentBaseCandidate<
 T extends BaseGroupCandidate,
>(candidates: T[]): T | undefined {
 const bases = candidates.filter(
  (candidate) => candidate.asignatura_id == null,
 );
 return bases.length === 1 ? bases[0] : undefined;
}

export function selectUniqueGroupCandidate<T>(candidates: T[]): T | undefined {
 return candidates.length === 1 ? candidates[0] : undefined;
}

export function groupImportIdentity(
 cycleId: number,
 plan: string | null | undefined,
 group: string | null | undefined,
) {
 return [
  cycleId,
  normalizeImportedPlan(plan),
  normalizeImportedGroup(group),
 ].join("|");
}
