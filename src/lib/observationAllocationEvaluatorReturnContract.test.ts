import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/054_fix_observation_evaluator_rpc_return_contract.sql", import.meta.url),
  "utf8",
);

describe("observation evaluator RPC return contract", () => {
  it("casts every returned expression to the declared PostgREST contract", () => {
    expect(migration).toContain("u.id::UUID");
    expect(migration).toContain("u.email::TEXT");
    expect(migration).toContain("u.rol::TEXT");
    expect(migration).toContain("COALESCE(p.included, true)::BOOLEAN");
    expect(migration).toContain("p.target_teacher_count::INTEGER");
    expect(migration).toContain("count(a.id)::BIGINT");
  });

  it("keeps the RPC authenticated-only and reloads the PostgREST schema cache", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_observation_allocation_evaluators(INTEGER) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_observation_allocation_evaluators(INTEGER) TO authenticated");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
