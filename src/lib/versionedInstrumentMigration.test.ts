import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/migrations/057_versioned_instrument_schema.sql", import.meta.url), "utf8");
const capture = readFileSync(new URL("../../supabase/migrations/058_versioned_instrument_submission.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../../supabase/migrations/059_seed_instrument_versions.sql", import.meta.url), "utf8");
const results = readFileSync(new URL("../../supabase/migrations/060_versioned_instrument_results.sql", import.meta.url), "utf8");

describe("versioned instrument migrations", () => {
  it("seeds the approved version, scale, section, and checklist structures", () => {
    expect(seed.match(/'planning','v2','[IVX]+','P\d+'/g)).toHaveLength(61);
    expect(seed).toContain("'coordination', 'v2'");
    expect(seed).toContain('"expected_scored_items":61');
    expect(seed).toContain('"min":0,"max":2');
    expect(seed).toContain("'observation_virtual', 'v1.2'");
    expect(seed).toContain("'observation_virtual','COM','COM5'");
    expect(seed.match(/\('(?:NEW_HIRE|RETURNING|DOCUMENTATION|OPERATIONS|CLOSURE)','AC\d+'/g)).toHaveLength(17);
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

  it("closes the test-cycle deletion graph without disabling audited deletion suppression", () => {
    for (const table of ["instrument_submissions", "instrument_answers", "instrument_evidence", "instrument_administrative_check_answers"]) {
      expect(capture).toContain(`'${table}'`);
      expect(capture).toContain(`public.test_cycle_delete_rows('${table}'`);
    }
    expect(schema).toContain("public.audit_test_cycle_row_suppression_active()");
  });
});
