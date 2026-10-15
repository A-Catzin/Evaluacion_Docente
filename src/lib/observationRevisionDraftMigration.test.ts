import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/099_observation_revision_drafts.sql", import.meta.url), "utf8");
const codes = ["observation_supervision_clinical", "observation_professional_practice", "observation_simulation", "observation_teaching_competencies"];

describe("observation revision draft migration", () => {
  it("extends the cycle-cleaned draft table without rewriting initial rows", () => {
    expect(sql).toMatch(/ALTER TABLE public\.instrument_submission_drafts\s+ADD COLUMN operation_id UUID,\s+ADD COLUMN supersedes_submission_id UUID REFERENCES public\.instrument_submissions\(id\)/);
    expect(sql).toMatch(/operation_id IS NULL AND supersedes_submission_id IS NULL/);
    expect(sql).toMatch(/operation_id IS NOT NULL AND supersedes_submission_id IS NOT NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]+\(operation_id\) WHERE operation_id IS NOT NULL/);
  });
  it("authorizes the current head and only returns the actor's head-anchored revision draft", () => {
    for (const code of codes) expect(sql).toContain(`'${code}'`);
    expect(sql).toContain("u.rol IN ('superadmin', 'coordinador', 'observador')");
    expect(sql).toContain("public.can_observe_assigned_teacher");
    expect(sql).toContain("v.status = 'active'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM public.instrument_submissions successor");
    expect(sql).toContain("d.submitted_by = v_actor");
    expect(sql).toContain("d.supersedes_submission_id = v_head.id");
    expect(sql).toContain("'head', CASE WHEN v_head.id IS NULL THEN NULL");
  });
  it("serializes save against the commit guard and refuses stale or colliding autosaves", () => {
    expect(sql).toContain("WHERE s.id = p_supersedes_submission_id FOR UPDATE");
    expect(sql).toContain("s.operation_id = p_operation_id AND s.submitted_by = v_actor");
    expect(sql).toContain("'completed', true");
    expect(sql).toContain("v_existing.operation_id IS DISTINCT FROM p_operation_id");
    expect(sql).toContain("d.supersedes_submission_id = p_supersedes_submission_id");
    expect(sql).toContain("'revision draft operation conflict'");
    expect(sql).toContain("'revision predecessor is no longer current'");
    expect(sql).toContain("octet_length(p_draft::TEXT) > 100000");
  });
  it("deletes only an exact actor-owned revision draft and cannot remove an initial draft", () => {
    expect(sql).toMatch(/DELETE FROM public\.instrument_submission_drafts d\s+WHERE d\.submitted_by = v_actor[^;]+d\.operation_id = p_operation_id[^;]+d\.supersedes_submission_id = p_supersedes_submission_id/s);
  });
  it("replaces initial RPCs narrowly while leaving the submission cleanup trigger alone", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.save_observation_instrument_draft(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.delete_observation_instrument_draft(");
    expect((sql.match(/AND d\.operation_id IS NULL/g) ?? [])).toHaveLength(3);
    expect(sql).toContain("ON CONFLICT (submitted_by, docente_id, cuatrimestre_id, version_id) DO UPDATE");
    expect(sql).toContain("WHERE d.operation_id IS NULL");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.discard_observation_drafts_on_submission");
  });
  it("limits execution to authenticated and keeps the table private", () => {
    for (const [name, args] of [["get_observation_revision_state", "INTEGER, INTEGER, UUID"], ["save_observation_revision_draft", "INTEGER, INTEGER, UUID, UUID, UUID, JSONB"], ["delete_observation_revision_draft", "INTEGER, INTEGER, UUID, UUID, UUID"]]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}(${args}) FROM PUBLIC, anon, authenticated, service_role`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO authenticated`);
    }
    expect(sql).not.toMatch(/GRANT\s+\w+\s+ON\s+(?:TABLE\s+)?public\.instrument_submission_drafts/i);
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
  });
});
