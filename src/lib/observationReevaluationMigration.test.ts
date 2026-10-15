import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/098_observation_reevaluation_rpc.sql", import.meta.url), "utf8");

describe("observation reevaluation SQL contract", () => {
  it("exposes only the dedicated authenticated revision entry point", () => {
    expect(sql).toContain("CREATE FUNCTION public.reevaluate_observation_instrument(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public.reevaluate_observation_instrument\([\s\S]*?FROM PUBLIC, anon, service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public.reevaluate_observation_instrument\([\s\S]*?TO authenticated/);
    expect(sql).not.toContain("public.submit_versioned_instrument(");
  });
  it("checks authorization before actor-scoped replay and inactive-version checks", () => {
    const auth = sql.indexOf("public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor)");
    const replay = sql.indexOf("s.operation_id = p_operation_id");
    const active = sql.indexOf("v.status = 'active'");
    expect(auth).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(auth);
    expect(active).toBeGreaterThan(replay);
    expect(sql).toContain("s.submitted_by = v_actor");
    expect(sql).toContain("s.revision_kind = 'revision'");
    expect(sql).toContain("instrument_submissions_one_revision_per_operation");
    expect(sql).toContain("instrument_submissions_one_revision_per_predecessor");
    expect(sql).toContain("GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME");
  });
  it("hashes the complete server-side request and writes immutable audited successors", () => {
    for (const field of ["p_version_id", "p_docente_id", "p_cuatrimestre_id", "p_asignatura_id", "p_grupo", "p_supersedes_submission_id", "p_operation_id", "p_answers", "p_evidence", "p_metadata", "v_actor"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("extensions.digest(convert_to(jsonb_build_object(");
    expect(sql).toContain("'sha256'");
    expect(sql).toContain("revision_kind, supersedes_submission_id, operation_id, operation_payload_hash");
    expect(sql).toContain("public.audit_write_event(");
    expect(sql).not.toMatch(/UPDATE public.instrument_submissions|DELETE FROM public.instrument_submissions/);
    for (const code of ["observation_supervision_clinical", "observation_professional_practice", "observation_simulation", "observation_teaching_competencies"]) expect(sql).toContain(code);
  });
  it("matches the observation validation and scoring contract", () => {
    for (const piece of ["jsonb_array_length(p_answers) <> v_item_count", "count(DISTINCT a->>'item_id')", "v_item.na_eligible", "trunc(v_value) <> v_value", "v_value < v_min OR v_value > v_max", "v_na_count * 100 > v_item_count * 20", "instrument_definition_snapshot(p_version_id)", "jsonb_array_length(p_evidence)", "count(DISTINCT x->>'section_id')", "INSERT INTO public.instrument_answers", "INSERT INTO public.instrument_evidence"]) expect(sql).toContain(piece);
  });
  it("keeps initial retry uniquely scoped without altering old submit", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_own_observation_instrument_submission(");
    expect(sql).toContain("AND s.revision_kind = 'initial'");
    expect(sql).toContain("s.submitted_by = v_actor");
  });
});
