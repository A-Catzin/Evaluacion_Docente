import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/049_optimize_test_cycle_delete_audit.sql", import.meta.url),
  "utf8",
);

describe("test cycle deletion audit suppression migration", () => {
  it("adds the exact index required by the integrity-chain predecessor lookup", () => {
    expect(migration).toContain("idx_audit_events_integrity_order");
    expect(migration).toContain("ON public.audit_events (occurred_at DESC, event_id DESC)");
  });

  it("keeps suppression private, transaction-local, and bound to the authenticated deletion RPC", () => {
    expect(migration).toContain("app.private_test_cycle_delete_audit_token");
    expect(migration).toContain("set_config('app.private_test_cycle_delete_audit_token', v_audit_suppression_token::TEXT, true)");
    expect(migration).toContain("c.transaction_id = txid_current()");
    expect(migration).toContain("c.backend_pid = pg_backend_pid()");
    expect(migration).toContain("c.actor_id = auth.uid()");
    expect(migration).toContain("c.token::TEXT = v_token");
    expect(migration).toContain("REVOKE ALL ON public.test_cycle_audit_suppression_context FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.audit_test_cycle_row_suppression_active() FROM PUBLIC");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION public.audit_test_cycle_row_suppression_active()");
    expect(migration.match(/INSERT INTO public\.test_cycle_audit_suppression_context/g)).toHaveLength(1);
  });

  it("suppresses only row events after a validated, durable summary and clears the context", () => {
    const summary = migration.indexOf("'test_cycle.deleted'");
    const enabled = migration.indexOf("set_config('app.private_test_cycle_delete_audit_token', v_audit_suppression_token::TEXT, true)");
    const firstDelete = migration.indexOf("PERFORM public.test_cycle_delete_rows('import_issues'");
    const cleanup = migration.indexOf("DELETE FROM public.test_cycle_audit_suppression_context");
    const reset = migration.indexOf("set_config('app.private_test_cycle_delete_audit_token', '', true)");

    expect(migration).toContain("IF public.audit_test_cycle_row_suppression_active() THEN");
    expect(summary).toBeGreaterThan(-1);
    expect(summary).toBeLessThan(enabled);
    expect(enabled).toBeLessThan(firstDelete);
    expect(firstDelete).toBeLessThan(cleanup);
    expect(cleanup).toBeLessThan(reset);
    expect(migration).toContain("'operational_counts', v_counts");
    expect(migration).not.toContain("DELETE FROM public.audit_events");
    expect(migration).not.toContain("DISABLE TRIGGER");
    expect(migration).not.toContain("CASCADE");
    expect(migration).not.toContain("statement_timeout");
  });

  it("retains the established authorization, guard, scoped deletion, and storage queue", () => {
    expect(migration).toContain("IF NOT public.audit_is_superadmin()");
    expect(migration).toContain("public.test_cycle_assert_deletable(v_cycle, p_confirmation)");
    expect(migration).toContain("public.test_cycle_assert_known_dependencies()");
    expect(migration).toContain("public.test_cycle_delete_rows('inscripciones', v_cycle.id)");
    expect(migration).toContain("test_cycle_storage_cleanup");
  });
});
