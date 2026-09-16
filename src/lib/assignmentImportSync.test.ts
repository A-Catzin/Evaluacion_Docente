import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planAssignmentImportSync } from "./assignmentImportSync";

const teacher = { id: 7, nombre: "Ana", apellidos: "López", activo: true };
const otherTeacher = { id: 9, nombre: "Beto", apellidos: "Díaz", activo: true };
const base = {
  id: 11,
  cuatrimestre_id: 4,
  clave: "A 1",
  plan_normalizado: "PLAN A",
  grado: "1",
  grupo_normalizado: "A 1",
  asignatura_id: null,
  docente_id: null,
  num_alumnos: 20,
};
const row = {
  row: 2,
  plan: "Plan A",
  group: "A 1",
  groupId: "",
  subjectKey: "MAT-01",
  subjectName: "Matemáticas",
  teacher: "ANA LOPEZ",
  teacherEmail: "",
  teacherEmployee: "",
};
function plan(overrides: Record<string, unknown> = {}) {
  return planAssignmentImportSync({
    cycleId: 4,
    rows: [row],
    teachers: [teacher],
    subjects: [{ id: 8, clave: "MAT-01" }],
    groups: [base],
    openIssues: [],
    ...overrides,
  });
}

describe("assignment import sync planning", () => {
  it("creates a missing subject and missing group as one safe assignment action", () => {
    const result = plan({ subjects: [], groups: [] });
    expect(result.blockers).toEqual([]);
    expect(result.actions).toMatchObject([
      {
        kind: "create",
        subjectAction: "create",
        groupAction: "create",
        subjectId: null,
      },
    ]);
    expect(result.summary).toMatchObject({
      subjectsCreated: 1,
      groupsCreated: 1,
    });
  });

  it("is idempotent for duplicate CSV rows", () => {
    const result = plan({ rows: [row, { ...row, row: 3 }] });
    expect(result.blockers).toEqual([]);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].rows).toEqual([2, 3]);
  });

  it("blocks conflicting teachers for the same CSV assignment", () => {
    const result = plan({
      rows: [row, { ...row, row: 3, teacher: "BETO DIAZ" }],
      teachers: [teacher, otherTeacher],
    });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ reason: "csv_asignacion_docente_conflictiva" }),
    );
  });

  it("blocks multiple persisted assignment matches instead of guessing", () => {
    const result = plan({
      groups: [
        base,
        {
          ...base,
          id: 21,
          asignatura_id: 8,
          docente_id: 7,
          importacion_key: "4|PLAN A|A 1|MAT-01",
        },
        {
          ...base,
          id: 22,
          asignatura_id: 8,
          docente_id: 7,
          importacion_key: "4|PLAN A|A 1|MAT-01",
        },
      ],
    });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ reason: "asignacion_duplicada" }),
    );
  });

  it("links a new assignment to an existing base group without requiring grade identity", () => {
    const result = plan({ groups: [{ ...base, grado: "" }] });
    expect(result.actions).toMatchObject([
      { kind: "create", baseIds: [11], groupAction: "existing", grade: "" },
    ]);
    expect(result.blockers).toEqual([]);
  });

  it("updates the teacher in place while retaining the persisted assignment ID", () => {
    const result = plan({
      groups: [
        base,
        {
          ...base,
          id: 21,
          asignatura_id: 8,
          docente_id: 3,
          importacion_key: "4|PLAN A|A 1|MAT-01",
        },
      ],
    });
    expect(result.actions).toMatchObject([
      {
        kind: "update",
        existingGroupId: 21,
        previousTeacherId: 3,
        teacherId: 7,
      },
    ]);
  });

  it("leaves assignments absent from the CSV outside the action set", () => {
    const result = plan({
      rows: [row],
      groups: [
        base,
        {
          ...base,
          id: 31,
          asignatura_id: 8,
          docente_id: 7,
          importacion_key: "4|PLAN A|A 1|MAT-01",
        },
        {
          ...base,
          id: 32,
          asignatura_id: 99,
          docente_id: 7,
          importacion_key: "4|PLAN A|A 1|HIS-01",
        },
      ],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      existingGroupId: 31,
      kind: "no-op",
    });
  });

  it("reports incomplete rows as warnings while preserving valid actions", () => {
    const result = plan({
      rows: [
        { ...row, plan: "", subjectName: "" },
        { ...row, row: 3 },
      ],
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ row: 2, reason: "fila_incompleta" }),
    );
    expect(result.actions).toMatchObject([{ row: 3 }]);
  });

  it("keeps preview read-only and exposes the preview/apply response contract", () => {
    const api = readFileSync(
      new URL("../pages/api/admin/importar-asignaciones.ts", import.meta.url),
      "utf8",
    );
    const migrations = [
      "079_idempotent_assignment_import.sql",
      "080_assignment_import_timeout_fix.sql",
    ].map((file) =>
      readFileSync(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
    const auditPerformanceMigration = readFileSync(
      new URL(
        "../../supabase/migrations/081_assignment_import_audit_and_index_perf.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const concurrentIndexMigration = readFileSync(
      new URL(
        "../../supabase/migrations/082_assignment_import_indexes_concurrently.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const timeoutDiagnosticsMigration = readFileSync(
      new URL(
        "../../supabase/migrations/083_assignment_import_timeout_diagnostics.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const lockDiagnosticsMigration = readFileSync(
      new URL(
        "../../supabase/migrations/084_assignment_import_lock_diagnostics.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const setBasedMigration = readFileSync(
      new URL(
        "../../supabase/migrations/085_assignment_import_set_based.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const auditTriggerFastPathMigration = readFileSync(
      new URL(
        "../../supabase/migrations/086_assignment_import_audit_trigger_fast_path.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const groupsWithoutEnrollmentCopyMigration = readFileSync(
      new URL(
        "../../supabase/migrations/087_assignment_import_groups_without_enrollment_copy.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(api).toContain('mode === "preview"');
    expect(api).toContain('formData.get("preview_signature") !== signature');
    expect(api).toMatch(/auth\.client\.rpc\(\s*"apply_assignment_import_sync"/);
    expect(api).toContain('applyStatus: "committed"');
    expect(api).toContain('applyStatus: "unknown"');
    expect(api).toContain("recalculationStatus");
    expect(api).toContain("recalculationPendingTeacherIds");
    expect(api).not.toContain("recalcularCalificacionDocente");
    expect(api).toContain("isTimeout ? 504 : 503");
    expect(api).toContain("const correlationId = randomUUID()");
    expect(api).toContain("proposal snapshot completed");
    expect(api).toContain("RPC invocation started");
    expect(api).toContain("RPC invocation completed");
    expect(api).toContain("diagnosticHint: rpcDiagnosticHint(error)");
    expect(api).not.toContain("console.info(text");
    expect(api).not.toContain("console.error(p_actions");
    for (const migration of migrations) {
      expect(migration).toContain("SECURITY DEFINER");
      expect(migration).toContain("SET search_path TO ''");
      expect(migration).toContain("public.audit_is_superadmin()");
      expect(migration).toContain(
        "PERFORM 1 FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE",
      );
      expect(migration).toContain("pg_advisory_xact_lock");
      expect(migration).toContain("DELETE FROM public.import_issues i");
      expect(migration).toContain("r.tipo = 'asignaciones'");
      expect(migration).not.toContain("refrescar_resultados_agregados");
      expect(migration).not.toContain("session_replication_role");
      expect(migration).toContain(
        "set_config('app.assignment_import_audit_token', extensions.gen_random_uuid()::TEXT, true)",
      );
      expect(migration).toContain(
        "INSERT INTO public.assignment_import_audit_suppression_context",
      );
      expect(migration).toContain("public.audit_write_event(");
      expect(migration.match(/assignment_import\.completed/g)).toHaveLength(1);
      expect(migration).not.toMatch(/DELETE FROM public\.grupos/);
      expect(migration).toMatch(
        /v_created := v_created \+ 1;\s+v_groups_created := v_groups_created \+ 1;\s+v_affected_teacher_ids := array_append\(v_affected_teacher_ids, v_teacher_id\)/,
      );
      expect(migration).toMatch(
        /v_updated := v_updated \+ 1;[\s\S]*?v_affected_teacher_ids := array_append\(v_affected_teacher_ids, v_teacher_id\);[\s\S]*?v_affected_teacher_ids := array_append\(v_affected_teacher_ids, v_previous_teacher_id\)/,
      );
      expect(migration).not.toMatch(
        /END IF;\s+v_affected_teacher_ids := array_append\(v_affected_teacher_ids, v_teacher_id\);\s+IF v_previous_teacher_id IS NOT NULL/,
      );
    }
    expect(auditPerformanceMigration).not.toMatch(/\bCREATE\s+INDEX\b/i);
    expect(auditPerformanceMigration).toContain(
      "Performance indexes are intentionally separate in migration 082",
    );
    expect(concurrentIndexMigration).toContain(
      "MUST RUN OUTSIDE A TRANSACTION",
    );
    expect(concurrentIndexMigration).toContain(
      "individually in Supabase SQL Editor",
    );
    expect(concurrentIndexMigration).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS inscripciones_assignment_import_source_idx",
    );
    expect(concurrentIndexMigration).toContain(
      "ON public.inscripciones (grupo_id, cuatrimestre_id)",
    );
    expect(concurrentIndexMigration).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS grupos_assignment_import_key_idx",
    );
    expect(concurrentIndexMigration).toContain(
      "ON public.grupos (cuatrimestre_id, asignatura_id, importacion_key)",
    );
    expect(concurrentIndexMigration).toContain(
      "WHERE activo = true AND importacion_key IS NOT NULL",
    );
    expect(concurrentIndexMigration).not.toMatch(/^\s*(?:BEGIN|COMMIT|DO)\b/im);
    expect(auditPerformanceMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.assignment_import_audit_suppression_context",
    );
    expect(auditPerformanceMigration).toContain(
      "TG_TABLE_NAME IN ('asignaturas', 'grupos', 'inscripciones')",
    );
    expect(auditPerformanceMigration).toContain(
      "public.audit_assignment_import_row_suppression_active()",
    );
    expect(auditPerformanceMigration).toContain(
      "c.transaction_id = txid_current()",
    );
    expect(auditPerformanceMigration).toContain(
      "c.backend_pid = pg_backend_pid()",
    );
    expect(auditPerformanceMigration).toContain("c.actor_id = auth.uid()");
    expect(auditPerformanceMigration).toContain(
      "REVOKE ALL ON public.assignment_import_audit_suppression_context",
    );
    expect(auditPerformanceMigration).not.toContain("session_replication_role");
    expect(auditPerformanceMigration).not.toContain(
      "refrescar_resultados_agregados",
    );

    // This asserts migration structure only; production timing must be measured
    // operationally rather than inferred from this static fast-path check.
    for (const migration of [
      auditPerformanceMigration,
      auditTriggerFastPathMigration,
    ]) {
      const auditRowChange = migration.slice(
        migration.indexOf(
          "CREATE OR REPLACE FUNCTION public.audit_row_change()",
        ),
      );
      const assignmentSuppression = auditRowChange.indexOf(
        "public.audit_assignment_import_row_suppression_active()",
      );
      const testCycleSuppression = auditRowChange.indexOf(
        "public.audit_test_cycle_row_suppression_active()",
      );
      const oldRowMaterialization = auditRowChange.indexOf("v_old := CASE");

      expect(auditRowChange).toMatch(/v_old JSONB;\s+v_new JSONB;/);
      expect(auditRowChange).not.toMatch(/v_(?:old|new) JSONB\s*:=/);
      expect(assignmentSuppression).toBeGreaterThan(-1);
      expect(testCycleSuppression).toBeGreaterThan(assignmentSuppression);
      expect(oldRowMaterialization).toBeGreaterThan(testCycleSuppression);
      expect(auditRowChange).toContain("v_new := CASE");
      expect(auditRowChange).toContain("public.audit_write_event(");
      expect(auditRowChange).toContain("SECURITY DEFINER");
      expect(auditRowChange).toContain("SET search_path TO ''");
      expect(migration).not.toContain("session_replication_role");
      expect(migration).not.toContain("refrescar_resultados_agregados");
    }
    expect(auditTriggerFastPathMigration).toContain("FROM pg_indexes");
    expect(auditTriggerFastPathMigration).toContain(
      "inscripciones_assignment_import_source_idx",
    );
    expect(auditTriggerFastPathMigration).not.toMatch(/\bCREATE\s+INDEX\b/i);

    for (const migration of [
      auditPerformanceMigration,
      timeoutDiagnosticsMigration,
    ]) {
      expect(migration).toContain("set_config('lock_timeout', '10s', true)");
      expect(migration).toContain(
        "set_config('statement_timeout', '85s', true)",
      );
      expect(migration).toContain("v_phase TEXT := 'authorization'");
      expect(migration).toContain("validation_locks");
      expect(migration).toContain("issue_cleanup");
      expect(migration).toContain("subject_resolution");
      expect(migration).toContain("base_group_validation");
      expect(migration).toContain("target_resolution");
      expect(migration).toContain("group_write_enrollment_copy");
      expect(migration).toContain("import_run_audit_summary");
      expect(migration).toContain("RAISE LOG 'assignment_import phase=%");
      expect(migration).toContain(
        "assignment import elapsed budget exceeded at phase % action %",
      );
      expect(migration).toContain("WHEN lock_not_available THEN");
      expect(migration).toContain("WHEN deadlock_detected THEN");
      expect(migration).not.toContain("WHEN query_canceled THEN");
      expect(migration).not.toContain("refrescar_resultados_agregados");
    }
    expect(lockDiagnosticsMigration).toContain("SECURITY DEFINER");
    expect(lockDiagnosticsMigration).toContain("SET search_path TO ''");
    expect(lockDiagnosticsMigration).toContain("public.audit_is_superadmin()");
    expect(lockDiagnosticsMigration).toContain("FOR UPDATE NOWAIT");
    expect(lockDiagnosticsMigration).toContain("pg_try_advisory_xact_lock");
    expect(lockDiagnosticsMigration).toContain("ERRCODE = '55P03'");
    expect(lockDiagnosticsMigration).toContain("cycle lock unavailable");
    expect(lockDiagnosticsMigration).toContain("subject lock unavailable");
    expect(lockDiagnosticsMigration).toContain("before_cycle_nowait");
    expect(lockDiagnosticsMigration).toContain("after_cycle_nowait");
    expect(lockDiagnosticsMigration).toContain("before_subject_try_lock");
    expect(lockDiagnosticsMigration).toContain("after_subject_try_lock");
    expect(lockDiagnosticsMigration).toContain("before_target_group_nowait");
    expect(lockDiagnosticsMigration).toContain("after_target_group_nowait");
    expect(lockDiagnosticsMigration).toContain(
      "set_config('app.assignment_import_audit_token'",
    );
    expect(lockDiagnosticsMigration).toContain("public.audit_write_event(");
    expect(lockDiagnosticsMigration).toContain(
      "DELETE FROM public.import_issues i",
    );
    expect(lockDiagnosticsMigration).toContain("r.tipo = 'asignaciones'");
    expect(lockDiagnosticsMigration).not.toContain(
      "refrescar_resultados_agregados",
    );
    expect(lockDiagnosticsMigration).not.toContain("session_replication_role");
    expect(lockDiagnosticsMigration).not.toMatch(/\bCREATE\s+INDEX\b/i);

    // Migration 085 stages and validates the whole proposal before enabling audit
    // suppression or writing. Its only loops are distinct, sorted lock passes.
    expect(setBasedMigration).toContain("SECURITY DEFINER");
    expect(setBasedMigration).toContain("SET search_path TO ''");
    expect(setBasedMigration).toContain("public.audit_is_superadmin()");
    expect(setBasedMigration).toContain(
      "pg_catalog.jsonb_array_elements(p_actions) WITH ORDINALITY",
    );
    expect(setBasedMigration).toContain(
      "CREATE TEMP TABLE import_assignment_actions ON COMMIT DROP",
    );
    expect(setBasedMigration).toContain(
      "CREATE TEMP TABLE import_assignment_subjects ON COMMIT DROP",
    );
    expect(setBasedMigration).toContain(
      "CREATE TEMP TABLE import_assignment_targets ON COMMIT DROP",
    );
    expect(setBasedMigration).toContain(
      "CREATE TEMP TABLE import_assignment_created_groups",
    );
    expect(setBasedMigration).toMatch(
      /FOR v_subject_key IN\s+SELECT s\.subject_key FROM pg_temp\.import_assignment_subjects s ORDER BY s\.subject_key/,
    );
    expect(setBasedMigration).toContain("pg_try_advisory_xact_lock");
    expect(setBasedMigration).not.toContain("pg_advisory_xact_lock(");
    expect(setBasedMigration).toMatch(
      /SELECT DISTINCT a\.target_group_id[\s\S]*?ORDER BY a\.target_group_id/,
    );
    expect(setBasedMigration).toContain("FOR UPDATE NOWAIT");
    expect(setBasedMigration).toContain(
      "assignment teacher changed since preview",
    );
    expect(setBasedMigration).toMatch(
      /UPDATE public\.grupos g\s+SET docente_id = a\.teacher_id_text::INTEGER, importacion_key = a\.assignment_key\s+FROM pg_temp\.import_assignment_actions a\s+WHERE g\.id = a\.target_group_id\s+AND nullif\(a\.previous_teacher_id_text, ''\)::INTEGER IS DISTINCT FROM a\.teacher_id_text::INTEGER;\s+GET DIAGNOSTICS v_updated = ROW_COUNT;/,
    );
    expect(setBasedMigration).toMatch(
      /UPDATE public\.grupos g\s+SET importacion_key = a\.assignment_key\s+FROM pg_temp\.import_assignment_actions a\s+WHERE g\.id = a\.target_group_id\s+AND nullif\(a\.previous_teacher_id_text, ''\)::INTEGER IS NOT DISTINCT FROM a\.teacher_id_text::INTEGER\s+AND g\.importacion_key IS DISTINCT FROM a\.assignment_key;/,
    );
    // Groups created by 085/087 deliberately remain empty. A future roster sync is
    // required before newly created groups can participate in student evaluations.
    for (const migration of [
      setBasedMigration,
      groupsWithoutEnrollmentCopyMigration,
    ]) {
      expect(migration).not.toMatch(/INSERT INTO public\.inscripciones/i);
    }
    expect(groupsWithoutEnrollmentCopyMigration).not.toContain(
      "public.inscripciones",
    );
    expect(groupsWithoutEnrollmentCopyMigration).toContain(
      "intentionally created empty",
    );
    expect(groupsWithoutEnrollmentCopyMigration).toContain(
      "separate roster synchronization",
    );
    for (const contract of [
      "SECURITY DEFINER",
      "SET search_path TO ''",
      "public.audit_is_superadmin()",
      "pg_catalog.pg_try_advisory_xact_lock",
      "FOR UPDATE NOWAIT",
      "base group changed since preview",
      "assignment target changed since preview",
      "INSERT INTO public.asignaturas",
      "INSERT INTO public.grupos",
      "UPDATE public.grupos g SET docente_id",
      "INSERT INTO public.import_runs",
      "public.audit_write_event(",
      "assignment_import.completed",
    ]) {
      expect(groupsWithoutEnrollmentCopyMigration).toContain(contract);
    }
    expect(groupsWithoutEnrollmentCopyMigration).not.toContain(
      "refrescar_resultados_agregados",
    );
    expect(groupsWithoutEnrollmentCopyMigration).not.toMatch(
      /DELETE FROM public\.grupos/,
    );
    expect(setBasedMigration).not.toMatch(/FOR v_action IN/);
    expect(setBasedMigration).toContain("DELETE FROM public.import_issues i");
    expect(setBasedMigration).toContain("r.tipo = 'asignaciones'");
    expect(
      setBasedMigration.indexOf("DELETE FROM public.import_issues i"),
    ).toBeGreaterThan(
      setBasedMigration.indexOf("target group lock unavailable"),
    );
    expect(
      setBasedMigration.indexOf("INSERT INTO public.asignaturas"),
    ).toBeGreaterThan(
      setBasedMigration.indexOf("DELETE FROM public.import_issues i"),
    );
    expect(setBasedMigration).toContain(
      "set_config('app.assignment_import_audit_token', extensions.gen_random_uuid()::TEXT, true)",
    );
    expect(setBasedMigration).toContain(
      "INSERT INTO public.assignment_import_audit_suppression_context",
    );
    expect(setBasedMigration).toContain("public.audit_write_event(");
    expect(
      setBasedMigration.match(/assignment_import\.completed/g),
    ).toHaveLength(1);
    expect(setBasedMigration).toContain(
      "assignment import elapsed budget exceeded",
    );
    expect(setBasedMigration).toContain("RAISE LOG 'assignment_import phase=%");
    expect(setBasedMigration).toContain("WHEN lock_not_available THEN");
    expect(setBasedMigration).toContain("WHEN deadlock_detected THEN");
    expect(setBasedMigration).not.toContain("refrescar_resultados_agregados");
    expect(setBasedMigration).not.toContain("session_replication_role");
    expect(setBasedMigration).not.toMatch(/DELETE FROM public\.grupos/);
    expect(setBasedMigration).not.toMatch(/\bCREATE\s+INDEX\b/i);
  });
});
