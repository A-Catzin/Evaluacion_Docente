export function selectUniqueGroupCandidate<T>(candidates: T[]): T | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}
