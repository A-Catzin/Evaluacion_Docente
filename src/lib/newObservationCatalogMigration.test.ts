import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = () => readFileSync(new URL("../../supabase/migrations/096_new_observation_instrument_catalog.sql", import.meta.url), "utf8");
const codes = ["CC", "PP", "SIM", "AUTO"] as const;
const definitions = ["observation_supervision_clinical", "observation_professional_practice", "observation_simulation", "observation_teaching_competencies"];
// SHA-256 of ordered `PREFIX/section/item\tobserver label` lines joined by LF,
// independently reconciled against the private source catalog (not needed in CI).
const approved = {
  CC: { count: 24, digest: "516a90e33cadbf3dfda7da87f8a6f89016ebad29a64a1e95ec148ea3946ea81c" },
  PP: { count: 24, digest: "b0edfbae26a874d3def645685fb7a18f5b939abe124ea1b03222379fd19ab107" },
  SIM: { count: 30, digest: "04b8179eb8e8b774cd56be8683a1415d29babbe26dac671c9f8d113ebaa55c4a" },
  AUTO: { count: 24, digest: "1ee1ac614b13a158dc36ba675cf6ed87a70df232a2a2dedc1eca5d729653e70e" },
};
const sourceHashes = [
  "5311fcc8d6559b1871394af42832c2e2e43bd4b8b8514c72e5b0fa848ad66d1c",
  "6a56fa46637ccfd7f066491c61be50bf68afe71a5259a2632a5690ed4c14faa6",
  "844a242659107ecf1848726288a65378073fa63a2e66e9b211339cccb88fc860",
  "675ffad6f76fd24c5bd0cb1b9e03dfb9c466cd0cc24a376312c6f851532eea44",
];

describe("new observation catalog migration", () => {
  it("extends the closed allowlist without exposing drafts or weakening function security", () => {
    const sql = migration();
    for (const code of [...definitions, "coordination", "planning", "observation_escolarizado", "observation_virtual", "observation_ejecutivo"]) expect(sql).toContain(`'${code}'`);
    expect(sql).toContain("DROP CONSTRAINT instrument_definitions_code_check");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_active_instrument_definition(p_code TEXT)");
    for (const clause of ["SECURITY DEFINER", "SET search_path TO ''", "v.status = 'active'", "v.effective_from <= now()", "v.effective_to IS NULL OR v.effective_to > now()", "public.instrument_definition_snapshot(v_version_id)", "REVOKE ALL ON FUNCTION public.get_active_instrument_definition(TEXT) FROM PUBLIC", "GRANT EXECUTE ON FUNCTION public.get_active_instrument_definition(TEXT) TO authenticated"]) expect(sql).toContain(clause);
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) public\.instrument_(?:versions|submissions|answers)/i);
    expect(sql).not.toContain("self_evaluation_");
  });

  it("seeds four draft observation definitions with source hashes and 1–3 / justified N/A policy", () => {
    const sql = migration();
    for (const [code, title] of definitions.map((code, i) => [code, ["Campos clínicos", "Práctica Profesional", "Simulación clínica", "Cultura y Deporte"][i]])) {
      expect(sql).toContain(`('${code}','observation','${title}')`);
    }
    expect(sql).toContain("SELECT d.id, 'v1.1', 'draft', CURRENT_TIMESTAMP,");
    expect(sql).not.toContain("2026-09-01");
    expect(sql).toContain("WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice', 'observation_simulation', 'observation_teaching_competencies')");
    expect(sql).toContain('"min":1,"max":3');
    for (const label of ["Requiere mejora", "Adecuado", "Destacado", "No aplica / No observable"]) expect(sql).toContain(label);
    expect(sql).toContain('"na_threshold_percent":20');
    expect(sql).toContain('"when":"not_applicable_or_not_observable"');
    for (const hash of sourceHashes) expect(sql).toContain(hash);
  });

  it("retains all 102 approved observer labels, unique stable codes and eight sections per instrument", () => {
    const sql = migration();
    const names = ["Cognitivas", "Metacognitivas", "Comunicativas", "Sociales", "Gestión de la Enseñanza", "Afectivas", "Tecno-Pedagógicas", "Normatividad"];
    const values = sql.split("INSERT INTO public.instrument_items(")[1]?.split(") AS x(source_code, section_code, item_code, label, position)")[0] ?? "";
    const sections = sql.split("INSERT INTO public.instrument_sections(")[1]?.split(") AS x(source_code, section_code, title, position)")[0] ?? "";
    const tuples = [...values.matchAll(/^\s*\('(CC|PP|SIM|AUTO)','(\d{2})','(\d{2})','((?:[^']|'')*)',(\d+)\),?$/gm)];
    expect(tuples).toHaveLength(102);
    expect(sections.match(/^\s*\('(CC|PP|SIM|AUTO)','\d{2}','[^']+',\d+\),?$/gm)).toHaveLength(32);
    for (const prefix of codes) {
      const entries = tuples.filter(([, code]) => code === prefix);
      expect(entries).toHaveLength(approved[prefix].count);
      const keys = entries.map(([, code, section, item]) => `${code}/${section}/${item}`);
      expect(new Set(keys).size).toBe(entries.length);
      for (const [sectionIndex, name] of names.entries()) expect(sections).toContain(`('${prefix}','${String(sectionIndex + 1).padStart(2, "0")}','${name}',${sectionIndex + 1})`);
      expect(sections.match(new RegExp(`\\('${prefix}','\\d{2}','[^']+',\\d+\\)`, "g"))).toHaveLength(8);
      for (const [, , , item, , position] of entries) expect(Number(position)).toBe(Number(item));
      const canonical = entries.map(([, code, section, item, label]) => `${code}/${section}/${item}\t${label.replaceAll("''", "'")}`).join("\n");
      expect(createHash("sha256").update(canonical).digest("hex")).toBe(approved[prefix].digest);
    }
    expect(values).toContain("Maneja adecuadamente sus emociones ante errores o situaciones críticas.");
    expect(values).toContain("Escucha y atiende dudas o comentarios del grupo.");
    expect(tuples.map(([, , , , label]) => label).join(" ")).not.toMatch(/\b(?:mis|atiendo|escucho|manejo|promuevo|fomento|explico)\b/i);
  });
});
