import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL(
    "../../supabase/migrations/057_versioned_instrument_schema.sql",
    import.meta.url,
  ),
  "utf8",
);
const capture = readFileSync(
  new URL(
    "../../supabase/migrations/058_versioned_instrument_submission.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = readFileSync(
  new URL(
    "../../supabase/migrations/059_seed_instrument_versions.sql",
    import.meta.url,
  ),
  "utf8",
);
const results = readFileSync(
  new URL(
    "../../supabase/migrations/060_versioned_instrument_results.sql",
    import.meta.url,
  ),
  "utf8",
);
const scoreRead = readFileSync(
  new URL(
    "../../supabase/migrations/070_allow_docente_versioned_score_read.sql",
    import.meta.url,
  ),
  "utf8",
);
const drafts = readFileSync(
  new URL(
    "../../supabase/migrations/090_instrument_submission_drafts.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("versioned instrument migrations", () => {
  it("seeds the approved version, scale, section, and checklist structures", () => {
    expect(seed.match(/'planning','v2','[IVX]+','P\d+'/g)).toHaveLength(61);
    expect(seed).toContain("'coordination', 'v2'");
    expect(seed).toContain('"expected_scored_items":61');
    expect(seed).toContain('"min":0,"max":2');
    expect(seed).toContain("'observation_virtual', 'v1.2'");
    expect(seed).toContain("'observation_virtual','COM','COM5'");
    expect(
      seed.match(
        /\('(?:NEW_HIRE|RETURNING|DOCUMENTATION|OPERATIONS|CLOSURE)','AC\d+'/g,
      ),
    ).toHaveLength(17);
    expect(seed).toContain('"administrative_checks_scored":false');
  });

  it("persists immutable snapshots, typed N/A reasons, and a strict threshold", () => {
    expect(schema).toContain("definition_snapshot JSONB NOT NULL");
    expect(schema).toContain("submitted_by UUID NOT NULL");
    expect(schema).toContain("submitted instruments are immutable");
    expect(schema).toContain("is_na BOOLEAN NOT NULL");
    expect(capture).toContain("eligible N/A with reason required");
    expect(capture).toContain("v_na_count * 100 > v_item_count * 20");
    expect(capture).toContain("complete answers required");
  });

  it("uses purpose-specific assignment checks and excludes invalid captures from official scores", () => {
    expect(capture).toContain("public.can_manage_coordinated_teacher");
    expect(capture).toContain("public.can_observe_assigned_teacher");
    expect(capture).toContain("v_status = 'valid'");
    expect(results).toContain("validity_status");
    expect(results).toContain("has_invalid_instrument");
    expect(results).toContain("performance result access required");
  });

  it("limits docente score-row reads to the docente's own submissions", () => {
    expect(scoreRead).toContain(
      "CREATE OR REPLACE FUNCTION public.versioned_instrument_score_rows(p_cuatrimestre_id INTEGER)",
    );
    expect(scoreRead).toContain(
      "RETURNS TABLE(docente_id INTEGER, purpose TEXT, validity_status TEXT, normalized_score NUMERIC, version_id UUID, submitted_at TIMESTAMPTZ)",
    );
    expect(scoreRead).toContain("SECURITY DEFINER");
    expect(scoreRead).toContain("SET search_path TO ''");
    expect(scoreRead).toContain(
      "v_role NOT IN ('superadmin', 'coordinador', 'docente')",
    );
    expect(scoreRead).toContain(
      "v_role = 'docente' AND s.docente_id = v_docente_id",
    );
    expect(scoreRead).toContain(
      "v_role = 'coordinador' AND public.can_manage_coordinated_teacher(s.docente_id, p_cuatrimestre_id)",
    );
    expect(scoreRead).toContain("auth.role() = 'service_role'");
    expect(scoreRead).toContain(
      "REVOKE ALL ON FUNCTION public.versioned_instrument_score_rows(INTEGER) FROM PUBLIC",
    );
    expect(scoreRead).toContain(
      "GRANT EXECUTE ON FUNCTION public.versioned_instrument_score_rows(INTEGER) TO authenticated",
    );
    expect(scoreRead).toContain("NOTIFY pgrst, 'reload schema'");
    expect(scoreRead).not.toContain(
      "get_versioned_instrument_submission_detail",
    );
  });

  it("stores observation working state separately from immutable final submissions", () => {
    expect(drafts).toContain(
      "CREATE TABLE public.instrument_submission_drafts",
    );
    expect(drafts).toContain(
      "UNIQUE (submitted_by, docente_id, cuatrimestre_id, version_id)",
    );
    expect(drafts).toContain(
      "ALTER TABLE public.instrument_submission_drafts ENABLE ROW LEVEL SECURITY",
    );
    expect(drafts).toContain("public.can_observe_assigned_teacher");
    expect(drafts).toContain("public.get_observation_instrument_draft");
    expect(drafts).toContain("public.save_observation_instrument_draft");
    expect(drafts).toContain("public.delete_observation_instrument_draft");
    expect(drafts).toContain("completed observation cannot be drafted");
  });

  it("closes the test-cycle deletion graph without disabling audited deletion suppression", () => {
    for (const table of [
      "instrument_submissions",
      "instrument_answers",
      "instrument_evidence",
      "instrument_administrative_check_answers",
    ]) {
      expect(capture).toContain(`'${table}'`);
      expect(capture).toContain(`public.test_cycle_delete_rows('${table}'`);
    }
    expect(drafts).toContain("'instrument_submission_drafts'");
    expect(drafts).toContain(
      "public.test_cycle_delete_rows(v_table, v_cycle.id)",
    );
    expect(schema).toContain(
      "public.audit_test_cycle_row_suppression_active()",
    );
  });
});
