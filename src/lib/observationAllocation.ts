export type ObservationAllocationEvaluator = {
  evaluatorId: string;
  included: boolean;
  targetTeacherCount: number | null;
  currentCount: number;
};

export type ObservationAllocationPlan = Record<string, {
  current: number;
  target: number | null;
  proposedTeacherIds: number[];
  final: number;
  exceedsTarget: boolean;
}>;

function rank(seed: string, value: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function planObservationAllocation(
  candidateTeacherIds: number[],
  evaluators: ObservationAllocationEvaluator[],
  seed: string,
): ObservationAllocationPlan {
  const plan: ObservationAllocationPlan = {};
  const included = evaluators.filter((evaluator) => evaluator.included);
  const orderedCandidates = [...new Set(candidateTeacherIds)]
    .sort((a, b) => rank(seed, String(a)) - rank(seed, String(b)));

  for (const evaluator of evaluators) {
    plan[evaluator.evaluatorId] = {
      current: evaluator.currentCount,
      target: evaluator.targetTeacherCount,
      proposedTeacherIds: [],
      final: evaluator.currentCount,
      exceedsTarget: evaluator.targetTeacherCount !== null && evaluator.currentCount > evaluator.targetTeacherCount,
    };
  }

  let cursor = 0;
  const targeted = included
    .filter((evaluator) => evaluator.targetTeacherCount !== null)
    .sort((a, b) => rank(seed, a.evaluatorId) - rank(seed, b.evaluatorId));
  for (const evaluator of targeted) {
    const deficit = Math.max(0, (evaluator.targetTeacherCount || 0) - evaluator.currentCount);
    for (let index = 0; index < deficit && cursor < orderedCandidates.length; index += 1) {
      const teacherId = orderedCandidates[cursor++];
      plan[evaluator.evaluatorId].proposedTeacherIds.push(teacherId);
      plan[evaluator.evaluatorId].final += 1;
    }
  }

  const noTarget = included.filter((evaluator) => evaluator.targetTeacherCount === null);
  while (cursor < orderedCandidates.length && noTarget.length > 0) {
    const teacherId = orderedCandidates[cursor++];
    const evaluator = [...noTarget].sort((a, b) => {
      const loadDifference = plan[a.evaluatorId].final - plan[b.evaluatorId].final;
      return loadDifference || rank(seed, `${teacherId}:${a.evaluatorId}`) - rank(seed, `${teacherId}:${b.evaluatorId}`);
    })[0];
    plan[evaluator.evaluatorId].proposedTeacherIds.push(teacherId);
    plan[evaluator.evaluatorId].final += 1;
  }

  return plan;
}
