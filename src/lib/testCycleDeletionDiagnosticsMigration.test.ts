import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/047_test_cycle_delete_diagnostics.sql", import.meta.url),
  "utf8",
);

describe("test cycle deletion diagnostics migration", () => {
  it("keeps each destructive precondition distinct and server-enforced", () => {
    expect(migration).toContain("test cycle is active");
    expect(migration).toContain("test cycle is not marked as test");
    expect(migration).toContain("cycle confirmation does not match");
    expect(migration).toContain("ERRCODE = 'TC001'");
    expect(migration).toContain("ERRCODE = 'TC002'");
    expect(migration).toContain("ERRCODE = 'TC003'");
  });

  it("continues to fail closed when the live foreign-key closure is unreviewed", () => {
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("test cycle dependency guard blocked deletion");
    expect(migration).toContain("ERRCODE = 'TC004'");
    expect(migration).not.toContain("CASCADE");
  });
});
