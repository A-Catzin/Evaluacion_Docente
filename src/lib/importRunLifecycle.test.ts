import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const importer = readFileSync(
  new URL("../pages/api/admin/importar-asignaciones.ts", import.meta.url),
  "utf8",
);
const sync = readFileSync(
  new URL("./assignmentImportSync.ts", import.meta.url),
  "utf8",
);
const adminImport = readFileSync(
  new URL("./adminImport.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/069_import_runs_update_policy.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("assignment import run lifecycle source contracts", () => {
  it("allows only active superadmins to update import completion fields", () => {
    expect(migration).toContain("GRANT UPDATE (");
    expect(migration).not.toContain("status");
    expect(migration).toContain("resumen,");
    expect(migration).toContain("finished_at,");
    expect(migration).toContain("filas_leidas");
    expect(migration).toContain(
      "DROP POLICY IF EXISTS import_runs_update_completion_superadmin",
    );
    expect(migration).toContain(
      "CREATE POLICY import_runs_update_completion_superadmin",
    );
    expect(migration).toContain("FOR UPDATE TO authenticated");
    expect(migration).toContain("USING (");
    expect(migration).toContain("WITH CHECK (");
    expect(migration).toContain("WHERE u.id = auth.uid()");
    expect(migration).toContain("u.rol = 'superadmin'");
    expect(migration).toContain("COALESCE(u.activo, true)");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).not.toContain("service_role");
  });

  it("creates and finalizes the run atomically inside the sync RPC, and surfaces RPC failures", () => {
    expect(importer).toContain('"apply_assignment_import_sync"');
    expect(importer).toContain("p_filas_leidas: resolved.proposal.rowsRead");
    expect(importer).toContain("p_resumen:");
    expect(importer).toMatch(
      /if \(error\)\s*return rpcApplyFailure\(error, \{/,
    );
    expect(importer).toContain("issuesResolved: result.issuesCleaned ?? 0");
    expect(importer).toContain('applyStatus: "committed"');
    expect(importer).not.toContain("revalidateOpenAssignmentIssues(");
  });

  it("blocks apply and reports matching diagnostics for unresolved or ambiguous groups", () => {
    expect(importer).toContain("blockers: resolved.proposal.blockers");
    expect(importer).toContain("if (resolved.proposal.blockers.length)");
    expect(importer).toContain(
      "La propuesta tiene bloqueadores y no puede aplicarse.",
    );
    expect(importer).toMatch(
      /blockers\.length\)\s*return json\([\s\S]*?409,/,
    );
    expect(sync).toContain('"grupo_base_ambiguo"');
    expect(sync).toContain("details: { ids: baseCandidates.map(");
  });

  it("does not send the legacy status column when finalizing a run", () => {
    const completion = adminImport.match(
      /const completion: Record<string, unknown> = \{([\s\S]*?)\n  \};/,
    )?.[1];

    expect(adminImport).toContain('status = "completed"');
    expect(completion).toContain("resumen: summary");
    expect(completion).toContain("finished_at: new Date().toISOString()");
    expect(completion).not.toMatch(/\bstatus\s*[:,]/);
    expect(adminImport).toContain("completion.filas_leidas = summary.rowsRead");
  });

  it("logs and returns import-run completion update failures", () => {
    expect(adminImport).toContain("[finishImportRun] update failed");
    expect(adminImport).toContain("[finishImportRun] update threw");
    expect(adminImport).toContain("return { ok: false, error:");
  });
});
