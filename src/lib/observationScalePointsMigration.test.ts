import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/118_observation_scale_points.sql", import.meta.url),
  "utf8",
);

describe("observation scale points migration", () => {
  it("declares 50 / 70 / 100 points only on the 1-3 observation scale", () => {
    expect(migration).toContain(`'{"points":{"1":50,"2":70,"3":100}}'::jsonb`);
    expect(migration).toContain("AND d.purpose = 'observation'");
    expect(migration).toContain(`'{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb`);
  });

  it("falls back to value / max * 100 when a scale has no points", () => {
    expect(migration).toContain("(p_scale->'points'->>(p_value::INTEGER)::TEXT)::NUMERIC");
    expect(migration).toContain("p_value / NULLIF((p_scale->>'max')::NUMERIC, 0) * 100");
  });

  it("scores new submissions and re-evaluations with the points average", () => {
    for (const fn of ["public.submit_versioned_instrument(", "public.reevaluate_observation_instrument("]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    }
    expect(migration.match(/v_points_sum := v_points_sum \+ public\.instrument_scale_points\(v_scale, v_value\);/g)).toHaveLength(2);
    expect(migration.match(/THEN round\(v_points_sum \/ \(v_item_count - v_na_count\), 2\) ELSE NULL END;/g)).toHaveLength(2);
    expect(migration).not.toContain("* v_max)) * 100");
  });

  it("recalculates stored observation scores from non-N/A answers with the immutability guard restored", () => {
    expect(migration).toContain("round(avg(public.instrument_scale_points(v.scale_metadata, a.numeric_value)), 2)");
    expect(migration).toContain("JOIN public.instrument_answers a ON a.submission_id = s.id AND NOT a.is_na");
    const disable = migration.indexOf("DISABLE TRIGGER instrument_submissions_immutable_trigger");
    const enable = migration.indexOf("ENABLE TRIGGER instrument_submissions_immutable_trigger");
    expect(disable).toBeGreaterThan(0);
    expect(enable).toBeGreaterThan(disable);
    expect(migration.indexOf("COMMIT;")).toBeGreaterThan(enable);
  });
});
