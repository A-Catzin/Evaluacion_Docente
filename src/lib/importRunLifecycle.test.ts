import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const importer = readFileSync(
  new URL("../pages/api/admin/importar-asignaciones.ts", import.meta.url),
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

  it("finalizes the run even if open-issue revalidation fails", () => {
    expect(importer).toContain("let issuesResolvedByRevalidation = 0");
    expect(importer).toContain("try {");
    expect(importer).toContain("revalidateOpenAssignmentIssues(");
    expect(importer).toContain("[Importar asignaciones] revalidation failed");
    expect(importer).toContain("revalidationWarning");
    expect(importer).toMatch(
      /catch \(error\) \{[\s\S]*?revalidationWarning[\s\S]*?\}[\s\S]*?await finishImportRun\(client, run\.id, summary\);/,
    );
  });

  it("records matching diagnostics for unresolved or ambiguous groups", () => {
    expect(importer).toContain("function groupDiagnosticDetails(");
    expect(importer).toContain("cycleId,");
    expect(importer).toContain("normalizedPlan: plan");
    expect(importer).toContain("normalizedGroup: group");
    expect(importer).toContain("activeGroupListCount: groupList.length");
    expect(importer).toContain("candidateIds:");
    expect(importer).toContain("candidateCount:");
    expect(importer).toContain("baseCandidateIds:");
    expect(importer).toContain("baseCandidateCount:");
    expect(importer).toContain("fallbackUsed,");
    expect(importer).toContain('"grupo_base_no_encontrado"');
    expect(importer).toContain('"grupo_ambiguo"');
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
