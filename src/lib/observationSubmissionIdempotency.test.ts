import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/091_observation_submission_idempotency.sql",
    import.meta.url,
  ),
  "utf8",
);
const submitApi = readFileSync(
  new URL("../pages/api/instrumentos/submit.ts", import.meta.url),
  "utf8",
);
const draftApi = readFileSync(
  new URL("../pages/api/instrumentos/draft.ts", import.meta.url),
  "utf8",
);
const capture = readFileSync(
  new URL("../components/VersionedInstrumentCapture.astro", import.meta.url),
  "utf8",
);

describe("observation submission idempotency", () => {
  it("limits retry recovery to the caller's assigned observation submission", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_own_observation_instrument_submission",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("public.can_observe_assigned_teacher");
    expect(migration).toContain("s.submitted_by = v_actor");
    expect(migration).toContain("AND s.purpose = 'observation'");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_own_observation_instrument_submission(INTEGER, INTEGER, UUID) TO authenticated",
    );
  });

  it("returns an existing final only for the observation uniqueness retry", () => {
    expect(submitApi).toContain(
      '"instrument_submissions_one_observation_capture"',
    );
    expect(submitApi).toContain('error.code === "23505"');
    expect(submitApi).toContain("isObservationSubmitRetry(error)");
    expect(submitApi).toContain(
      '"get_own_observation_instrument_submission"',
    );
    expect(submitApi).toContain("idempotent: true");
  });

  it("treats a completed final as authoritative over a racing draft save", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.save_observation_instrument_draft",
    );
    expect(migration).toContain("RETURN jsonb_build_object('completed', true)");
    expect(migration).toContain("DELETE FROM public.instrument_submission_drafts");
    expect(migration).toContain(
      "CREATE TRIGGER instrument_submissions_discard_observation_drafts_trigger",
    );
    expect(migration).not.toContain("completed observation cannot be drafted");
    expect(draftApi).toContain("completed, draft: data");
    expect(capture).toContain("if (result.completed)");
    expect(capture).toContain("La observación ya fue enviada.");
  });
});
