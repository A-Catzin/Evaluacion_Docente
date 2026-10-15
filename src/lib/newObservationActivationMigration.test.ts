import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = () => readFileSync(new URL("../../supabase/migrations/101_activate_new_observation_instruments.sql", import.meta.url), "utf8");
const expected = [
  ["observation_supervision_clinical", "Campos clínicos", 24],
  ["observation_professional_practice", "Práctica Profesional", 24],
  ["observation_simulation", "Simulación clínica", 30],
  ["observation_teaching_competencies", "Cultura y Deporte", 24],
] as const;

describe("separately gated new observation activation", () => {
  it("is one atomic, fail-closed DO block over exactly four distinct approved definitions and draft v1.1 versions", () => {
    const sql = migration();
    expect(sql.match(/\bDO \$\$/g)).toHaveLength(1);
    expect(sql).toMatch(/DO \$\$[\s\S]*BEGIN[\s\S]*END\s*\$\$;/);
    for (const [code, title, count] of expected) expect(sql).toContain(`('${code}', '${title}', ${count})`);
    expect(sql).toContain("count(DISTINCT d.code)");
    expect(sql).toContain("v.version = 'v1.1'");
    expect(sql).toContain("v.status = 'draft'");
    expect(sql).toContain("d.purpose = 'observation'");
    expect(sql).toMatch(/IF v_definition_count <> 4 OR v_distinct_count <> 4 THEN\s+RAISE EXCEPTION/);
    expect(sql).toMatch(/IF v_draft_count <> 4 THEN\s+RAISE EXCEPTION/);
    expect(sql).toMatch(/IF v_competing_count <> 0 THEN\s+RAISE EXCEPTION/);
    expect(sql).toContain("FOR UPDATE OF d");
    expect(sql).toContain("FOR UPDATE OF v");
  });

  it("checks each instrument's eight scored sections, exact criterion count, 1–3 scale and N/A policy before activation", () => {
    const sql = migration();
    expect(sql).toContain("v_section_count <> 8");
    expect(sql).toContain("v_item_count <> v_expected.item_count");
    expect(sql).toContain("v.scale_metadata =");
    expect(sql).toContain('"min":1,"max":3');
    expect(sql).toContain("v.scoring_metadata =");
    expect(sql).toContain('"na_threshold_percent":20');
    expect(sql).toContain("i.na_eligible");
    expect(sql).toContain("i.scored");
    expect(sql).toContain('"not_applicable_or_not_observable"');
    expect(sql).toMatch(/RAISE EXCEPTION 'observation activation catalog mismatch'/);
  });

  it("updates only the approved draft versions and asserts exactly four transitions without touching windows, cycles, teachers or legacy versions", () => {
    const sql = migration();
    expect(sql.match(/\bUPDATE\s+public\./gi)).toHaveLength(1);
    expect(sql).toMatch(/UPDATE public\.instrument_versions v\s+SET status = 'active', effective_from = now\(\), effective_to = NULL/);
    expect(sql).toMatch(/WHERE v\.status = 'draft' AND v\.version = 'v1\.1'/);
    expect(sql).toMatch(/GET DIAGNOSTICS v_updated_count = ROW_COUNT;\s+IF v_updated_count <> 4 THEN\s+RAISE EXCEPTION/);
    expect(sql).not.toMatch(/\b(?:INSERT|DELETE|TRUNCATE|GRANT|REVOKE|ALTER|CREATE)\b/i);
    expect(sql).not.toMatch(/\b(?:cuatrimestre_id|docente_id|submitted_by|assignment|instrument_submission_windows|instrument_submissions|instrument_answers|cycle_11)\b/i);
    for (const legacy of ["observation_escolarizado", "observation_virtual", "observation_ejecutivo"]) expect(sql).not.toContain(legacy);
  });
});
