import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/094_admin_teacher_responsibility_completion.sql", import.meta.url),
  "utf8",
);
const migrationV2 = readFileSync(
  new URL("../../supabase/migrations/095_admin_teacher_responsibility_completion_v2.sql", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../pages/admin/cumplimiento-docente.astro", import.meta.url),
  "utf8",
);

describe("teacher responsibility completion migration contract", () => {
  it("provides one authenticated, fail-closed aggregation RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_teacher_responsibility_completion");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("u.rol = 'superadmin'");
    expect(migration).toContain("coalesce(u.activo, true)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_teacher_responsibility_completion(INTEGER) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_teacher_responsibility_completion(INTEGER) TO authenticated");
  });

  it("uses active Escolarizado assignments, real teacher submission dates, and separate NP counts", () => {
    expect(migration).toContain("g.activo IS TRUE");
    expect(migration).toContain("g.modalidad = 'Escolarizado'");
    expect(migration).toContain("public.normalize_planning_subject_name");
    expect(migration).toContain("COALESCE(p.first_teacher_submitted_at, p.fecha_subida)");
    expect(migration).toContain("planning_np_subject_count");
    expect(migration).toContain("planning_np_group_count");
    expect(migration).not.toContain("p.estado = 'Aprobado'");
  });

  it("classifies NP-only assignments separately from delivery and not-applicable rows", () => {
    expect(migration).toContain("AND coalesce(gnbt.np_group_count, 0) > 0 THEN 'np'");
    expect(migration).toContain("AND pbt.np_subject_count = pbt.subject_count THEN 'np'");
    expect(migration).toContain("AND pbt.np_subject_count = 0");
    expect(migration).toContain("AND coalesce(gnbt.np_group_count, 0) = 0 THEN 'complete'");
    expect(migration).toContain("WHEN pbt.submitted_count > 0 THEN 'partial'");
  });

  it("matches the RPC return types to the source columns", () => {
    expect(migration).toContain("autodiagnostico_completed_at TIMESTAMP WITHOUT TIME ZONE");
    expect(migration).toContain("coalesce(d.nombre, '')::TEXT");
    expect(migration).toContain("coalesce(d.apellidos, '')::TEXT");
    expect(migration).toContain("coalesce(d.email, '')::TEXT");
    expect(migration).toContain("coalesce(d.num_empleado, '')::TEXT");
  });

  it("preserves naive autodiagnóstico wall clocks and formats zoned plans in Cancun", () => {
    expect(page).toContain("function formatNaiveDate");
    expect(page).toContain("timeZone: 'UTC'");
    expect(page).toContain("formatNaiveDate(row.autodiagnosticoCompletedAt)");
    expect(page).toContain("function formatZonedDate");
    expect(page).toContain("timeZone: 'America/Cancun'");
    expect(page).toContain("formatZonedDate(row.planningLastSubmittedAt)");
  });

  it("presents NP as a separate non-delivery planning state", () => {
    expect(page).toContain("'np'");
    expect(page).toContain("No debe entregar planeación");
    expect(page).toContain("bg-violet-100 text-violet-700");
    expect(page).toContain("Exento por NP · sin planeación enviada");
  });

  it("v2 enforces access and computes group NP as a union without multiplying teacher rows", () => {
    expect(migrationV2).toContain("CREATE FUNCTION public.admin_teacher_responsibility_completion_v2");
    expect(migrationV2).toContain("SECURITY DEFINER SET search_path TO ''");
    expect(migrationV2).toContain("auth.uid()");
    expect(migrationV2).toContain("u.rol = 'superadmin'");
    expect(migrationV2).toContain("REVOKE ALL ON FUNCTION public.admin_teacher_responsibility_completion_v2(INTEGER) FROM PUBLIC, anon");
    expect(migrationV2).toContain("GRANT EXECUTE ON FUNCTION public.admin_teacher_responsibility_completion_v2(INTEGER) TO authenticated");
    expect(migrationV2).toContain("gnp.grupo_id IS NOT NULL OR psnp.subject_key IS NOT NULL");
    expect(migrationV2).toContain("public.normalize_planning_subject_name(a.nombre)");
    expect(migrationV2).toContain("AND public.normalize_planning_subject_name(a.nombre) <> ''");
    expect(migrationV2).toContain("count(*) FILTER (WHERE cg.is_np)");
    expect(migrationV2).toContain("WHEN coalesce(gc.group_count, 0) = 0 THEN 'not_applicable'");
    expect(migrationV2).toContain("WHEN gc.np_group_count = gc.group_count THEN 'np'");
    expect(migrationV2).toContain("pbt.submitted_count = pbt.subject_count THEN 'complete'");
    expect(migrationV2).toContain("ca.revoked_at IS NULL");
    expect(migrationV2).toContain("AND u.activo IS TRUE");
    expect(migrationV2).toMatch(/array_agg\(COALESCE\(NULLIF\(btrim\(au.raw_user_meta_data->>'full_name'\), ''\),\s*NULLIF\(btrim\(u.email::TEXT\), ''\), ca.coordinador_id::TEXT\)/);
    expect(migrationV2).toContain("ca.coordinador_id::TEXT), ca.coordinador_id)::TEXT[] AS names");
    expect(migrationV2).toContain("LEFT JOIN coordinators_by_teacher cbt ON cbt.docente_id = d.id");
  });

  it("labels administrative fulfillment separately from delivery and explains zero groups", () => {
    expect(page).toContain('Ambas cumplidas');
    expect(page).toContain('Una cumplida');
    expect(page).toContain('Ninguna cumplida');
    expect(page).toContain("row.planningGroupCount === 0 ? 'Sin grupos aplicables'");
  });

  it("uses the authenticated RPC client rather than a service-role aggregation", () => {
    expect(page).toContain('requireRole(Astro.cookies, ["superadmin"])');
    expect(page).toContain('auth.client.rpc("admin_teacher_responsibility_completion_v2"');
    expect(page).not.toContain("dbAdmin");
  });
});
