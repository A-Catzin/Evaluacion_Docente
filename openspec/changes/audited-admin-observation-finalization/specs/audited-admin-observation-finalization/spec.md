# Audited Admin Observation Finalization Specification

## Purpose

This capability lets an authenticated superadmin finalize an eligible initial, versioned observation draft created by another coordinator without impersonation. It preserves the coordinator's authorship as provenance, attributes submission to the acting superadmin, and fails safely when the reviewed draft or any competing state changes.

## Requirements

### Requirement: Eligible initial versioned drafts

The system MUST allow this flow only for saved initial drafts belonging to an active, versioned observation instrument. Eligibility MUST cover all seven approved format families, including traditional Escolarizado v1.2 and the Escolarizado, Ejecutivo, and Virtual instrument families. It MUST exclude unversioned legacy observation tables, reevaluations, and revision drafts. The flow MUST NOT change eligibility or permissions for ordinary initial capture.

#### Scenario: Eligible traditional versioned draft

- GIVEN a saved initial draft for traditional Escolarizado v1.2
- AND the draft satisfies the active instrument's eligibility rules
- WHEN an authorized superadmin opens the admin finalization flow
- THEN the draft is eligible for review

#### Scenario: Other approved versioned formats

- GIVEN a saved initial draft in any of the other six approved versioned format families
- AND the draft satisfies that active instrument's rules
- WHEN an authorized superadmin opens the admin finalization flow
- THEN the draft is eligible for review

#### Scenario: Excluded observation draft

- GIVEN a draft from an unversioned legacy table, a reevaluation, or a revision
- WHEN an administrator requests this finalization flow
- THEN the system MUST deny eligibility without changing the draft or final observation state

### Requirement: Authenticated administrator and distinct authorship

Only an active, authenticated superadmin MUST be able to review and confirm finalization. The trusted authenticated identity MUST determine the submitting actor; client-provided identity MUST NOT select or replace that actor. The final record MUST preserve the original draft owner as distinct provenance, and MUST identify the confirming superadmin as submitter. The original owner MUST see the final attribution and result only where existing authorization permits; this capability MUST NOT expand owner access or create notifications.

#### Scenario: Authorized finalization retains both identities

- GIVEN an eligible draft owned by another coordinator
- AND the current authenticated actor is an active superadmin
- WHEN the superadmin confirms finalization
- THEN the final identifies the superadmin as submitter
- AND records the coordinator as original draft owner provenance
- AND exposes the result to the owner only under existing authorization

#### Scenario: Unauthenticated or unauthorized actor

- GIVEN a requester without an active authenticated superadmin role
- WHEN the requester attempts to review or confirm finalization
- THEN the request is denied
- AND no final, draft cleanup, or misleading success audit is created

#### Scenario: Client identity substitution

- GIVEN an authenticated superadmin submits a request containing a different actor identity
- WHEN the system processes the request
- THEN attribution uses the authenticated identity
- AND the supplied identity cannot grant access or alter provenance

### Requirement: Exact review and explicit confirmation

Before confirmation, the system MUST present the target teacher, cycle and instrument; draft owner and submitting administrator; expected score after permitted normalization; previous/current observation result, if any; and the count of stale N/A reasons that will be removed. The administrator MUST explicitly confirm after reviewing these details. Confirmation MUST be bound to the exact draft revision and content hash reviewed. A missing, stale, changed, or mismatched draft MUST require fresh review and confirmation.

#### Scenario: Review and confirm unchanged draft

- GIVEN an eligible draft with a stable revision and content hash
- WHEN the administrator reviews it
- THEN the review shows the required target, identity, score, prior-result, and cleanup-count details
- AND no finalization occurs until the administrator explicitly confirms that reviewed revision

#### Scenario: Draft changed after review

- GIVEN the administrator reviewed a particular draft revision and hash
- WHEN the draft is edited, replaced, or removed before confirmation
- THEN confirmation is rejected and fresh review is required
- AND no final, cleanup, or partial audit effect occurs

#### Scenario: Preview does not leak draft data

- GIVEN an administrator who is permitted to use this flow
- WHEN the administrator previews an eligible draft
- THEN the preview reveals only information necessary for its authorized review
- AND does not expose unrelated drafts or unauthorized response data

### Requirement: Validation and limited normalization

The system MUST validate answers against the active instrument, including complete unique item coverage, required evidence, true N/A policy, integer numeric scores within that instrument's allowed scale, and applicable scoring and uniqueness rules. It MUST reject incomplete, invalid, or out-of-range data rather than repair it. For numeric answers only, it MAY remove a stale N/A reason; it MUST preserve every score, evidence entry, genuine N/A reason, and other substantive content. Ordinary capture MUST clear a hidden stale N/A reason when an answer changes to a numeric score.

#### Scenario: Numeric stale N/A reason is normalized

- GIVEN an otherwise valid draft with numeric answers carrying stale N/A reasons
- WHEN the administrator reviews and confirms the draft
- THEN the preview reports the number of stale reasons to be removed
- AND finalization removes only those reasons while preserving scores, evidence, genuine N/A reasons, and other content

#### Scenario: True N/A and zero stale reasons

- GIVEN a valid draft with true N/A answers and no stale numeric N/A reasons
- WHEN the administrator reviews and confirms it
- THEN the cleanup count is zero
- AND genuine N/A reasons remain unchanged

#### Scenario: Excessive or invalid true N/A

- GIVEN a draft that violates the active instrument's true N/A policy
- WHEN the administrator attempts to confirm it
- THEN validation rejects it without finalization or draft cleanup

#### Scenario: Invalid or out-of-range numeric answer

- GIVEN a draft with an incomplete answer set, invalid evidence, or a numeric score outside the active instrument's integer scale
- WHEN the administrator attempts to confirm it
- THEN validation rejects it without changing the score, creating a final, or cleaning up drafts

#### Scenario: Ordinary form clears hidden stale reason

- GIVEN a user changes an answer from N/A to a numeric score in ordinary capture
- WHEN the user saves the draft
- THEN the hidden N/A reason is cleared and is not retained as a stale numeric reason

### Requirement: Revalidate authorization and observation eligibility

At confirmation, the system MUST revalidate the authenticated actor's role, the draft's assignment and ownership eligibility, the active instrument version, the submission window, and observation uniqueness and conflict state. An expired window, lost assignment, inactive version, existing conflicting final or revision, or any other failed eligibility check MUST block finalization. There MUST be no administrative override for an expired window or lost assignment.

#### Scenario: Window expired or assignment lost

- GIVEN an otherwise eligible reviewed draft
- WHEN its submission window has expired or its required assignment is no longer valid before confirmation
- THEN finalization is denied without an override
- AND no final, draft cleanup, or partial audit effect occurs

#### Scenario: Version or observation conflict

- GIVEN a reviewed draft whose version became inactive or whose target has a conflicting final or revision
- WHEN the administrator confirms
- THEN finalization is rejected without overwriting the conflict or changing drafts

### Requirement: Competing drafts fail closed atomically

Finalization MUST fail if any actor other than the selected draft owner has a matching initial draft for the same teacher, cycle, and instrument version. The system MUST establish this condition through the final insertion and any matching-draft cleanup, so concurrent creation or edits cannot cause another actor's draft to be deleted. A changed competing-draft set since review MUST invalidate confirmation and require fresh review. With any competing draft, finalization MUST leave all drafts, final state, and audit state unchanged. A nonlocking preflight count alone is insufficient to satisfy this requirement.

#### Scenario: No other actor has a matching draft

- GIVEN the selected draft is unchanged and no other actor has a matching initial draft
- WHEN the administrator confirms and all other validations pass
- THEN the system may finalize the observation and clean up the selected draft

#### Scenario: One or multiple other actors have matching drafts

- GIVEN one or multiple other actors have a matching initial draft for the same teacher, cycle, and version
- WHEN the administrator reviews or confirms the selected draft
- THEN finalization fails closed
- AND no matching draft is deleted
- AND no final or partial success audit is created

#### Scenario: Competing draft set changes after review

- GIVEN the administrator reviewed a draft set with no other actor's matching draft
- WHEN another actor's matching draft is created or changed before finalization completes
- THEN finalization fails closed and requires fresh review
- AND no final, draft cleanup, or partial audit effect occurs

#### Scenario: Concurrent competing draft mutation

- GIVEN another actor creates or edits a matching initial draft concurrently with confirmation
- WHEN finalization and the competing change overlap
- THEN the system MUST serialize or reject the conflicting outcome so that another actor's draft is never removed
- AND no final is committed when the competing draft exists or appears under that race

### Requirement: Atomic finalization and same-operation retry

A successful operation MUST create exactly one valid immutable initial final, preserve the reviewed content subject only to permitted N/A normalization, record separate submitter and owner provenance, create the discoverable audit association, and perform only permitted selected-draft cleanup as one atomic outcome. Any failure before commit MUST leave no final, cleanup, or partial success audit. A retry MAY return the same result only for the same confirmed operation; a different actor, draft revision, or conflicting final MUST NOT receive an apparently successful idempotent result. Conflicting finals or revisions MUST never be overwritten.

#### Scenario: Successful confirmation

- GIVEN an unchanged reviewed draft, no competing draft, and all current authorization and validation checks pass
- WHEN the administrator confirms
- THEN exactly one immutable final is committed with reviewed scores and evidence, authenticated submitter, original-owner provenance, and an audit association
- AND only the selected draft may be cleaned up

#### Scenario: Same confirmed operation is retried

- GIVEN a confirmation operation already committed successfully
- WHEN that same operation is retried by the same authenticated actor for the same draft revision
- THEN the system returns the same finalization result without creating another final or repeating cleanup

#### Scenario: Different operation or pre-commit failure

- GIVEN a retry changes the actor or draft revision, or a failure occurs before commit
- WHEN the request is processed
- THEN it is rejected or fails without a misleading success result
- AND a pre-commit failure leaves final, drafts, and audit state unchanged

### Requirement: Post-commit recalculation failure is recoverable

If downstream score recalculation fails after the final has committed, the system MUST retain the immutable final, show a nonduplicate recoverable warning, and raise an operational alert for follow-up. It MUST NOT resubmit the final or claim that the committed record was rolled back.

#### Scenario: Recalculation succeeds after commit

- GIVEN a finalization has committed
- WHEN downstream score recalculation succeeds
- THEN the system reports the committed result normally

#### Scenario: Recalculation fails after commit

- GIVEN a finalization has committed
- WHEN downstream score recalculation fails
- THEN the immutable final remains persisted
- AND the administrator receives a nonduplicate recoverable warning and an operational alert is raised
- AND recovery does not resubmit the final or claim rollback
