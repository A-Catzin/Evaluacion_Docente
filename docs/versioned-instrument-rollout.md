# Versioned Instrument Rollout

The updated coordination, planning, and observation instruments are additive. Existing captures continue to render and score through their original legacy paths.

## Apply Order

1. Confirm migrations through `055_fix_cycle_teacher_candidate_eligibility.sql` are applied.
2. Apply `056_normalize_escolarizado_modality.sql`.
3. Apply `057_versioned_instrument_schema.sql`.
4. Apply `058_versioned_instrument_submission.sql`.
5. Apply `059_seed_instrument_versions.sql`.
6. Apply `060_versioned_instrument_results.sql`.
7. Reload PostgREST after the migration transaction commits.

## Staged Verification

1. In staging, call `get_active_instrument_definition` for the five seeded codes and verify the expected version, scale, section count, and item count.
2. Capture one valid planning submission with exactly 20% N/A and confirm it is valid, immutable, and has a normalized score.
3. Capture one submission above 20% N/A and confirm it persists as `invalid_excessive_na`, retains its reasons and snapshot, and contributes no official score.
4. Verify a coordinator cannot submit an observation without an observation assignment, and an observer cannot submit coordination or planning.
5. Verify a historical record remains unchanged and a current versioned record renders from its stored snapshot.
6. On a disposable test cycle, run the deletion preview, confirm all four `instrument_*` capture tables appear, then execute the approved test-cycle deletion procedure.
7. Verify reports and CSV show pending, valid, partial, invalid-excessive-N/A, and historical states without exposing observation evidence to observers.

## Rollback

Disable new capture entry points or retire the active instrument versions. Do not delete versioned submissions or modify prior versions. The legacy capture and result paths remain available for historical records.
