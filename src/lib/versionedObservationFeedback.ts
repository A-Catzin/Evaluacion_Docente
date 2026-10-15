export type VersionedObservationSubmission = {
  id: string;
  [key: string]: unknown;
};

export type VersionedObservationAnswer = {
  submission_id: string;
  item_id: string;
  numeric_value: number | null;
  is_na: boolean;
  na_reason?: string | null;
};

export type VersionedObservationEvidence = {
  submission_id: string;
  section_id: string;
  evidence: string | null;
};

export type VersionedObservationFeedback = {
  submission: VersionedObservationSubmission;
  answersByItem: Record<string, VersionedObservationAnswer>;
  evidenceBySection: Record<string, string>;
};

export function buildVersionedObservationFeedback(
  submissions: readonly VersionedObservationSubmission[],
  answers: readonly VersionedObservationAnswer[],
  evidence: readonly VersionedObservationEvidence[],
): VersionedObservationFeedback[] {
  const answersBySubmission = new Map<string, Record<string, VersionedObservationAnswer>>();
  for (const answer of answers) {
    const current = answersBySubmission.get(answer.submission_id) || {};
    current[answer.item_id] = answer;
    answersBySubmission.set(answer.submission_id, current);
  }

  const evidenceBySubmission = new Map<string, Record<string, string>>();
  for (const entry of evidence) {
    if (!entry.evidence) continue;
    const current = evidenceBySubmission.get(entry.submission_id) || {};
    current[entry.section_id] = entry.evidence;
    evidenceBySubmission.set(entry.submission_id, current);
  }

  return submissions.map((submission) => ({
    submission,
    answersByItem: answersBySubmission.get(submission.id) || {},
    evidenceBySection: evidenceBySubmission.get(submission.id) || {},
  }));
}
