import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/097_new_observation_revision_schema.sql", import.meta.url), "utf8");

const codes = ["observation_supervision_clinical", "observation_professional_practice", "observation_simulation", "observation_teaching_competencies"];

describe("new observation revision schema", () => {
  it("preserves initial capture idempotency under the legacy index name", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX instrument_submissions_one_observation_capture\s+ON public\.instrument_submissions\(docente_id, cuatrimestre_id, purpose, version_id\)\s+WHERE purpose = 'observation' AND revision_kind = 'initial'/);
    expect(sql).toContain("DEFAULT 'initial'");
  });
  it("restricts complete revision tuples and uniquely identifies predecessors and operations", () => {
    expect(sql).toContain("REFERENCES public.instrument_submissions(id)");
    expect(sql).toContain("operation_payload_hash");
    expect(sql).toMatch(/revision_kind = 'initial' AND supersedes_submission_id IS NULL AND operation_id IS NULL AND operation_payload_hash IS NULL/);
    expect(sql).toMatch(/revision_kind = 'revision' AND purpose = 'observation' AND supersedes_submission_id IS NOT NULL AND operation_id IS NOT NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]+\(supersedes_submission_id\)[^;]+WHERE revision_kind = 'revision'/s);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]+\(operation_id\)[^;]+WHERE revision_kind = 'revision'/s);
  });
  it("guards only four new codes, authenticates the current assigned actor and checks the immutable tip", () => {
    for (const code of codes) expect(sql).toContain(`'${code}'`);
    expect(sql).toContain("NEW.submitted_by <> auth.uid()");
    expect(sql).toContain("public.can_observe_assigned_teacher");
    expect(sql).toContain("u.rol IN ('superadmin', 'coordinador', 'observador')");
    expect(sql).toContain("v_predecessor.docente_id IS DISTINCT FROM NEW.docente_id");
    expect(sql).toContain("v_predecessor.cuatrimestre_id IS DISTINCT FROM NEW.cuatrimestre_id");
    expect(sql).toContain("v_predecessor.version_id IS DISTINCT FROM NEW.version_id");
    expect(sql).toContain("v_predecessor.purpose IS DISTINCT FROM NEW.purpose");
    expect(sql).toContain("s.supersedes_submission_id = p.id");
    expect(sql).not.toContain("p.submitted_by = NEW.submitted_by");
  });
  it("requires an active, currently effective version for revision inserts", () => {
    expect(sql).toMatch(/WHERE v\.id = NEW\.version_id[^;]+v\.status = 'active' AND v\.effective_from <= now\(\)\s+AND \(v\.effective_to IS NULL OR v\.effective_to > now\(\)\)/);
  });
  it("does not rewrite history or expose the guard for direct execution", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.guard_new_observation_revision\(\) FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE)\s+(?:FROM\s+)?public\.instrument_submissions\b/i);
    expect(sql).not.toMatch(/GRANT EXECUTE/i);
  });
});
