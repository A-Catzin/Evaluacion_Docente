import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const previous = readFileSync(
  new URL("../../supabase/migrations/070_allow_docente_versioned_score_read.sql", import.meta.url),
  "utf8",
);
const ordering = readFileSync(
  new URL("../../supabase/migrations/100_observation_score_ordering.sql", import.meta.url),
  "utf8",
);
const functionSql = (sql: string) =>
  sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.versioned_instrument_score_rows"),
    sql.indexOf("$function$;", sql.indexOf("CREATE OR REPLACE FUNCTION public.versioned_instrument_score_rows")) + "$function$;".length,
  );

describe("observation score ordering migration", () => {
  it("keeps the existing 070 result signature and role/teacher/cycle scope, changing only the row order", () => {
    expect(functionSql(ordering).replace(
      "    )\n  ORDER BY s.submitted_at DESC, s.id DESC;",
      "    );",
    )).toBe(functionSql(previous));
    expect(ordering).toContain("RETURNS TABLE(docente_id INTEGER, purpose TEXT, validity_status TEXT, normalized_score NUMERIC, version_id UUID, submitted_at TIMESTAMPTZ)");
    expect(ordering).toContain("ORDER BY s.submitted_at DESC, s.id DESC");
  });

  it("retains authenticated-only execute access and does not alter rows or indexes", () => {
    expect(ordering).toContain("REVOKE ALL ON FUNCTION public.versioned_instrument_score_rows(INTEGER) FROM PUBLIC;");
    expect(ordering).toContain("GRANT EXECUTE ON FUNCTION public.versioned_instrument_score_rows(INTEGER) TO authenticated;");
    expect(ordering).not.toMatch(/\b(?:CREATE\s+INDEX|ALTER\s+TABLE|UPDATE\s+|DELETE\s+FROM|DROP\s+FUNCTION|\bTO\s+anon\b)\b/i);
    expect(ordering).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
