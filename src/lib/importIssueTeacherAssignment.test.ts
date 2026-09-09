import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("import issue teacher assignment source contracts", () => {
  const page = readFileSync(
    new URL("../pages/admin/grupos-asignados.astro", import.meta.url),
    "utf8",
  );
  const api = readFileSync(
    new URL(
      "../pages/api/admin/asignar-docente-incidencias.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const importer = readFileSync(
    new URL("../pages/api/admin/importar-asignaciones.ts", import.meta.url),
    "utf8",
  );
  const reconciliation = readFileSync(
    new URL("./importIssueReconciliation.ts", import.meta.url),
    "utf8",
  );
  const resolutionPolicyMigration = readFileSync(
    new URL(
      "../../supabase/migrations/068_import_issue_resolution_update_policy.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("renders persistent incident selection, an adjacent selection panel, and active-teacher search", () => {
    expect(page).toContain('class="issue-select');
    expect(page).toContain('id="issue-selected-items"');
    expect(page).toContain('id="issue-clear-selection"');
    expect(page).toContain('id="issue-teacher-search"');
    expect(page).toContain("data-teacher-search=");
    expect(page).toContain("sessionStorage");
    expect(page).toContain("/api/admin/asignar-docente-incidencias");
    expect(page).toContain("actualizando incidencias abiertas");
  });

  it("creates or updates only a resolved subject-assignment target and then records resolution", () => {
    expect(api).toContain("authorizeSuperadmin(cookies)");
    expect(api).toContain("rawIssueIds.length > MAX_ISSUES");
    expect(api).toContain(
      "new Set(requestedIssueIds).size !== requestedIssueIds.length",
    );
    expect(api).toContain('.eq("activo", true)');
    expect(api).toContain("import_runs(tipo)");
    expect(api).toContain('.eq("resolution_status", "open")');
    expect(api).toContain("resolveImportIssueTarget");
    expect(api).toMatch(
      /\.from\("grupos"\)\s*\.select\(\s*"id,clave,cuatrimestre_id,docente_id,asignatura_id,num_alumnos,plan_normalizado,grado,grupo_normalizado,importacion_key",\s*\)\s*\.eq\("cuatrimestre_id", cycleId\)\s*\.eq\("activo", true\),/,
    );
    expect(api).toMatch(
      /\.in\("id", existingGroupIds\)\s*\.eq\("cuatrimestre_id", cycleId\)\s*\.eq\("activo", true\)\s*\.select\("id"\);/,
    );
    expect(importer).toMatch(
      /\.from\("grupos"\)[\s\S]*?\.eq\("cuatrimestre_id", cycleId\)\s*\.eq\("activo", true\);/,
    );
    expect(reconciliation).toMatch(
      /\.from\("grupos"\)[\s\S]*?\.eq\("cuatrimestre_id", cycleId\)\s*\.eq\("activo", true\);/,
    );
    expect(api).toContain(
      "assignmentPayload(cycleId, action.target, teacherId)",
    );
    expect(api).toContain('.in("grupo_id", action.target.baseIds)');
    expect(api).toContain(
      'onConflict: "estudiante_id,grupo_id,cuatrimestre_id"',
    );
    expect(api).toContain(".update({ docente_id: teacherId })");
    expect(api).toContain('.in("id", existingGroupIds)');
    expect(api).toContain('resolution_status: "resolved"');
    expect(api).toContain('resolution_kind: "manual_teacher_assignment"');
    expect(api).toContain(
      "RETURNING/SELECT may be filtered by RLS after an issue transitions from open to resolved.",
    );
    expect(api).toContain(
      '.eq("resolution_status", "open");\n      if (resolveError) {',
    );
    expect(api).not.toContain(
      "const { data: resolvedIssues, error: resolveError }",
    );
    expect(api).toContain(
      "recalcularCalificacionDocente(client, docenteId, cycleId)",
    );
    expect(api).toContain("[import_issue_assignment] resolution update failed");
    expect(api).toContain('code: "import_issue_assignment_resolution_failed"');
  });

  it("grants only resolution metadata updates to active superadmins", () => {
    expect(resolutionPolicyMigration).toContain("GRANT UPDATE (");
    expect(resolutionPolicyMigration).toContain("resolution_status");
    expect(resolutionPolicyMigration).toContain("resolved_at");
    expect(resolutionPolicyMigration).toContain("resolved_by");
    expect(resolutionPolicyMigration).toContain("resolution_kind");
    expect(resolutionPolicyMigration).toContain("resolved_group_id");
    expect(resolutionPolicyMigration).toContain(
      "ON TABLE public.import_issues TO authenticated",
    );
    expect(resolutionPolicyMigration).toContain(
      "DROP POLICY IF EXISTS import_issues_update_resolution_superadmin",
    );
    expect(resolutionPolicyMigration).toContain(
      "CREATE POLICY import_issues_update_resolution_superadmin",
    );
    expect(resolutionPolicyMigration).toContain("FOR UPDATE TO authenticated");
    expect(resolutionPolicyMigration).toContain("USING (");
    expect(resolutionPolicyMigration).toContain("WITH CHECK (");
    expect(resolutionPolicyMigration).toContain("WHERE u.id = auth.uid()");
    expect(resolutionPolicyMigration).toContain("u.rol = 'superadmin'");
    expect(resolutionPolicyMigration).toContain("COALESCE(u.activo, true)");
  });

  it("keeps reports historical while page and imports reconcile only open corrected targets", () => {
    expect(page).toContain(".eq('resolution_status', 'open')");
    expect(page).toContain("assignedSubjectGroupForIssue");
    expect(importer).toContain("revalidateOpenAssignmentIssues(");
    expect(reconciliation).toContain(
      'resolution_kind: "assignment_import_revalidation"',
    );
    expect(reconciliation).toContain('.eq("resolution_status", "open")');
  });
});
