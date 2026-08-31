import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/052_admin_assignment_allocation.sql", import.meta.url),
  "utf8",
);

describe("admin observation allocation migration", () => {
  it("uses the cycle-scoped active-group candidate pool and the expanded evaluator roles", () => {
    expect(migration).toContain("g.cuatrimestre_id = p_cuatrimestre_id AND g.activo IS TRUE");
    expect(migration).toContain("d.activo IS TRUE");
    expect(migration).toContain("('superadmin', 'coordinador', 'observador')");
    expect(migration).toContain("automatic_allocation");
  });

  it("persists preferences and a server-bound, idempotent preview confirmation", () => {
    for (const table of ["observation_allocation_preferences", "observation_allocation_previews", "observation_allocation_runs"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`'${table}'`);
      expect(migration).toContain(`public.test_cycle_delete_rows('${table}'`);
    }
    expect(migration).toContain("fingerprint UUID NOT NULL");
    expect(migration).toContain("created_by = auth.uid() FOR UPDATE");
    expect(migration).toContain("already_confirmed");
    expect(migration).toContain("allocation preview is stale");
    expect(migration).toContain("cuatrimestre_id = p_cuatrimestre_id AND fingerprint = p_fingerprint");
  });

  it("keeps allocation metadata auditable without client-controlled actor attribution", () => {
    expect(migration).toContain("observation_allocation.previewed");
    expect(migration).toContain("observation_allocation.confirmed");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("REVOKE ALL ON public.observation_allocation_preferences");
  });
});
