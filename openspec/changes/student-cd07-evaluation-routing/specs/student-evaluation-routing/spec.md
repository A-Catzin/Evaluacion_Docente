# Student Evaluation Routing Specification

## Purpose

Define safe CD-07 routing for the production rollout to exactly the 20 selected CSV-present real 27-1 assignments, plus a distinct, isolated opt-in production fixture exception for a new TEST-CD course and separately verified test student and teacher. TEST-CD is never counted among the 20 or included in institutional outputs. Real-assignment eligibility is determined by an authoritative server-side roster and mapping; because student enrollment/role and signed activation mapping remain unverified, rollout activation MUST remain blocked. The fixture path also MUST remain disabled, with no production writes, until separately authorized by an explicit production write plan. Other assignments and existing evaluation history retain their current general-form behavior.

## Requirements

### Requirement: CD-07 routing is limited to verified approved assignments

The real production rollout MUST select CD-07 only for assignments reconciled against the authoritative approved roster of exactly 20 CSV-present actual 27-1 assignments. A separately specified, isolated TEST-CD fixture path is an explicit exception for testing only; it MUST NOT expand or be counted in that 20-assignment roster. The selected CSV contains 529 Pending rows across 20 distinct groups, each with one teacher and subject; Pending is not a submission or proof of student enrollment. Four earlier missing groups, unassigned PINTURA TUP (B), and CSV-absent AJEDREZ TUP (A) are excluded (six of the former 26); TEST-CD remains separate and disabled. Real-assignment eligibility MUST derive from trusted server-side assignment and enrollment data, not from a client-supplied course name, group identifier, or active-list appearance. If the approved roster or exact assignment mapping is absent, ambiguous, conflicting, or stale, real rollout access MUST fail closed. No assignment identities may be inferred or invented to bypass this gate.

#### Scenario: Eligible assignment is reconciled

- GIVEN the authoritative approved roster and exact 27-1 assignment mapping have been verified
- AND an authenticated student is enrolled in an active eligible assignment
- WHEN the student selects the teacher through the normal evaluation workflow
- THEN the server offers the CD-07 form for that assignment only

#### Scenario: Roster or mapping is unavailable

- GIVEN student enrollment/role or signed activation mapping for the selected 20-assignment CSV roster has not been verified
- WHEN activation or a student request attempts to resolve CD-07 eligibility
- THEN CD-07 access is denied and activation remains blocked
- AND no guessed identity or client-provided value can make the assignment eligible

#### Scenario: Assignment is not among the selected 20

- GIVEN a real assignment is absent from the reconciled approved set, including an unassigned class
- WHEN the student selects its teacher
- THEN the assignment does not route to CD-07 by virtue of its displayed name or list visibility
- AND TEST-CD is not admitted to the real-assignment route; it can be used only through the separate fixture requirement below

### Requirement: Existing general evaluations remain compatible

The system MUST preserve the existing general evaluation behavior and contract for assignments not verified for CD-07. CD-07 routing MUST NOT alter, reinterpret, or prevent access to existing general-form submissions or history.

#### Scenario: Non-CD-07 assignment is selected

- GIVEN a student is eligible to evaluate an assignment that is not verified for CD-07
- WHEN the student selects its teacher
- THEN the existing general evaluation form and submission behavior remain available

#### Scenario: Historical general evaluation is read or scored

- GIVEN a general evaluation was submitted before CD-07 routing
- WHEN its history or existing result is accessed or recalculated
- THEN its stored answers and established interpretation remain unchanged

### Requirement: CD-07 response content is validated as one instrument version

A CD-07 submission MUST identify the applicable instrument version and contain exactly 20 ordered answers, each a required integer from 1 through 5 only. The UI MUST NOT offer N/A for these items; the API and database MUST reject N/A, null, blank, `na_reason`, and alternate nonnumeric codes. It MAY contain open item 21, whose text MUST be no longer than 2,000 characters. Incomplete, extra, malformed, or out-of-range responses MUST be rejected without partial effects.

#### Scenario: Valid response with optional open item

- GIVEN an eligible student has the CD-07 form for its verified assignment
- WHEN the student submits 20 valid integer answers and either omits item 21 or supplies text of at most 2,000 characters
- THEN the response satisfies the CD-07 content contract

#### Scenario: N/A or missing quantitative value is rejected at every boundary

- GIVEN an eligible student opens CD-07
- WHEN the form renders
- THEN none of its 20 quantitative items offers N/A
- AND each requires an integer 1 through 5
- GIVEN a submission contains N/A, null, blank, `na_reason`, an alternate nonnumeric code, or any value outside integer 1 through 5 in any quantitative item
- WHEN it reaches the API or database, including through a bypass of the UI
- THEN it is rejected with no partial response, submission marker, or score update

#### Scenario: Invalid response is rejected

- GIVEN a request has other than 20 ordered answers, a non-integer or out-of-range answer, or an item 21 longer than 2,000 characters
- WHEN the request is submitted
- THEN it is rejected without storing a partial response, submission marker, or score update

### Requirement: Submission authorization and one-time persistence are atomic

The system MUST authenticate the submitting student and verify the student role, enrollment, selected teacher/group assignment, active cycle, instrument version, and eligibility at submission time. Student identity and original actor attribution MUST come from trusted authentication context, not request payload. A student MUST have at most one completed submission per student, assignment/group, and cycle across instrument versions. Response persistence and the submission control MUST be atomic; a failed or retried request MUST NOT create a duplicate or partial result.

#### Scenario: Authorized eligible student submits

- GIVEN an authenticated student with the required role is enrolled in the selected assignment for the active cycle
- AND no submission exists for that student, assignment, and cycle
- WHEN the student submits a valid response for the server-selected instrument version
- THEN the response and one-time submission state are committed together with the authenticated actor attribution

#### Scenario: Authorization or eligibility check fails

- GIVEN the user is unauthenticated, has the wrong role, is not enrolled, or the assignment, teacher, cycle, or version is not valid
- WHEN a submission is attempted
- THEN the submission is denied with no response, submission marker, or score side effect

#### Scenario: Duplicate or retried submission

- GIVEN a response has already been committed for the student, assignment, and cycle
- WHEN the same request or a competing retry is submitted again
- THEN no second response is created and the existing submission remains intact

#### Scenario: Persistence fails during submission

- GIVEN a valid request passes authorization
- WHEN persistence fails before the operation completes
- THEN neither a partial response nor a completed submission marker is left behind

### Requirement: CD-07 persistence is versioned and non-destructive

CD-07 responses MUST be stored in a way that preserves instrument/version identity and does not overwrite or reinterpret historical general-form data. Any schema or data migration for this change MUST be forward-only and non-destructive. Destructive migration 043 MUST NOT be replayed, recreated, or adapted as part of CD-07 routing.

#### Scenario: CD-07 response is persisted alongside history

- GIVEN an eligible CD-07 submission is accepted
- WHEN its response is persisted
- THEN its instrument version remains distinguishable and existing general responses and history remain unchanged

#### Scenario: Migration is reviewed for non-destruction

- GIVEN a migration is proposed for CD-07 persistence
- WHEN it is reviewed or applied
- THEN it preserves existing evaluation answers, controls, and history
- AND it does not replay, recreate, or adapt destructive migration 043

### Requirement: Scoring uses the existing student indicator semantics

Valid CD-07 responses MUST contribute to the same student evaluation indicator as general student evaluations. The CD-07 score MUST normalize the mean of its 20 answers on the 1–5 scale to 0–100 using `(mean - 1) * 25`. Aggregation MUST weight valid responses by response count, consistent with the existing indicator, without retroactively changing historical score interpretation.

#### Scenario: Valid CD-07 response is included in the indicator

- GIVEN a valid CD-07 response is accepted for an institutionally eligible assignment
- WHEN student evaluation scores are calculated
- THEN its normalized 0–100 score contributes to the same student indicator and is weighted by valid response count

#### Scenario: Historical general scores are recalculated

- GIVEN historical general-form responses exist
- WHEN the shared indicator is recalculated after CD-07 support
- THEN general responses retain their established normalization and interpretation

### Requirement: TEST-CD is excluded from institutional results

TEST-CD submissions MUST be excluded from all institutional teacher indicators, subject results, reports, exports, evaluation denominators, and recalculations, regardless of whether TEST-CD appears in an active list. This exclusion MUST NOT prevent an authorized fixture from submitting a test form through the permitted test workflow.

#### Scenario: Separately authorized TEST-CD fixture submits while course is visible

- GIVEN TEST-CD is a distinct fixture course, not one of the 20 real assignments, and is visible in an active list
- AND a separate production write plan is explicitly authorized
- AND the request is bound to trusted TEST-CD course identity, the authenticated separately verified test student and enrollment, the verified teacher assignment, the active cycle, and an enabled feature gate
- WHEN that verified fixture submits a valid form through the opt-in fixture path
- THEN the submission may be accepted only for test purposes
- AND it is excluded from every institutional teacher indicator, subject result, report, export, denominator, and recalculation

#### Scenario: TEST-CD fixture authorization is absent or spoofed

- GIVEN the separate production write plan, feature gate, trusted course identity, authenticated test account/enrollment, verified teacher assignment, or active cycle is absent or invalid
- WHEN a fixture submission is attempted, including with client-supplied or spoofed course names or IDs
- THEN the fixture path is unavailable and no production write occurs
- AND TEST-CD cannot be made eligible by active-list visibility or client-supplied identity

A feature gate is a design option for isolating the fixture path; this requirement does not assert that such a gate is already implemented.

#### Scenario: Institutional reporting encounters TEST-CD data

- GIVEN TEST-CD has one or more submissions
- WHEN any institutional score, report, export, denominator, or recalculation is produced
- THEN none of those submissions contribute to the institutional output

### Requirement: Actor attribution and response privacy are preserved

Accepted submissions MUST retain attribution to the original authenticated actor for audit. Responses and optional comments MUST be accessible only to authorized workflows and MUST NOT expose student identity or private response content through unauthorized views, reports, exports, or logs. OpenSpec artifacts MUST NOT contain test emails, personal data, live responses, or production URLs.

#### Scenario: Submission is audited

- GIVEN an authenticated student submission is committed
- WHEN an authorized audit reviews the submission
- THEN the original authenticated actor and submission provenance are available without replacing them with a later processing actor

#### Scenario: Unauthorized access to response content

- GIVEN a user or output path is not authorized to access identifiable response content
- WHEN it requests or emits evaluation data
- THEN private response content and student identity are not disclosed

### Requirement: Activation has explicit gates and recoverable rollback

CD-07 MUST NOT be activated until the selected 20-group roster, student enrollment/role and signed exact 27-1 activation mapping are verified, persistence and scoring compatibility are reviewed, and backup, access, reporting, and deployment readiness are approved. Routing activation MUST be separable from schema deployment. If routing or scoring fails, CD-07 exposure and submission MUST be disableable while preserving committed responses and audit history. Recovery of committed data MUST use an authorized, reviewed forward recovery plan; application rollback MUST NOT be treated as undoing committed schema changes or submissions.

#### Scenario: Pre-activation gate is incomplete

- GIVEN any required roster, mapping, compatibility, backup, access, report-consumer, or deployment review is incomplete
- WHEN activation is requested
- THEN activation is blocked and existing non-CD-07 evaluation flow remains available

#### Scenario: Routing or scoring failure requires rollback

- GIVEN CD-07 routing or scoring has been activated and a failure is detected
- WHEN rollback is initiated
- THEN CD-07 exposure and submission can be disabled without deleting committed responses, audit history, or migration state
- AND any persisted-data correction requires a separately authorized forward recovery plan

### Requirement: Production testing requires separate user authorization

Creating or using production test courses, accounts, or submissions MUST require a separate explicit user-authorized plan. Inclusion of this spec or ordinary CD-07 activation approval MUST NOT authorize production writes or testing. An explicitly authorized fixture may submit a test form while its data remains excluded from institutional results as required above.

#### Scenario: Production test lacks separate authorization

- GIVEN no separate explicit user authorization and approved test plan exists
- WHEN a production course, account, or submission test is proposed
- THEN no production test write is performed

#### Scenario: Production fixture test is separately authorized

- GIVEN a separate explicit user-authorized production write plan is approved
- AND the fixture uses the trusted TEST-CD course identity, separately verified authenticated test student and enrollment, verified teacher assignment, active cycle, and enabled feature gate
- WHEN the fixture submits a test form through its distinct opt-in path
- THEN the test may proceed only within the approved plan's scope
- AND TEST-CD is not counted among the 20 real assignments
- AND its response remains excluded from all institutional indicators, results, reports, exports, denominators, and recalculations

#### Scenario: Fixture write plan has not been approved

- GIVEN no separate explicit production write plan is approved
- WHEN TEST-CD fixture access or submission is requested
- THEN the fixture path remains disabled and no production write occurs
