import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync('supabase/migrations/108_cd07_progress_fixture_guard.sql', 'utf8');

describe('CD-07 native progress source guard', () => {
  it('replaces only the deployed signature with staff authorization and fixed security context', () => {
    const sql = migration();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION "public"\."obtener_progreso_encuesta_estudiantil_nativa"\("p_cuatrimestre_id" integer\) RETURNS TABLE\("docente_id" integer, "inscripciones_elegibles" bigint, "controles_enviados" bigint, "respuestas_nativas" bigint\)/);
    expect(sql).toMatch(/LANGUAGE "plpgsql" STABLE SECURITY DEFINER\s+SET "search_path" TO ''/);
    expect(sql).toMatch(/u\.id = auth\.uid\(\)[\s\S]*u\.activo IS TRUE[\s\S]*v_rol NOT IN \('superadmin', 'coordinador'\)/);
    expect(sql).toMatch(/p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0/);
    expect(sql).toMatch(/FROM public\.cuatrimestres c\s+WHERE c\.id = p_cuatrimestre_id/);
  });

  it('does not convert classifier errors into general eligibility or filter only the final projection', () => {
    const sql = migration();
    const eligible = sql.split('WITH inscripciones_elegibles AS (')[1]?.split('),\n  grupos_elegibles AS (')[0];
    expect(eligible).toContain("IN ('general-19', 'cd07-real')");
    expect(eligible).not.toMatch(/'fixture'|'unavailable'/);
    expect(sql).not.toMatch(/COALESCE\s*\(\s*public\.cd07_verified_assignment_origin|EXCEPTION WHEN|ON ERROR/);
    expect(sql.indexOf('cd07_verified_assignment_origin')).toBeLessThan(sql.indexOf('grupos_elegibles AS ('));
  });

  it('filters exact assignments inside eligible enrollments before all three historic counts', () => {
    const sql = migration();
    const eligible = sql.split('WITH inscripciones_elegibles AS (')[1]?.split('),\n  grupos_elegibles AS (')[0];
    expect(eligible).toMatch(/FROM public\.inscripciones i[\s\S]*JOIN public\.grupos g[\s\S]*g\.activo IS TRUE[\s\S]*JOIN public\.docentes d[\s\S]*JOIN public\.asignaturas a/);
    expect(eligible).toMatch(/public\.cd07_verified_assignment_origin\(g\.cuatrimestre_id, g\.id, g\.docente_id, g\.asignatura_id\) IN \('general-19', 'cd07-real'\)/);
    expect(sql).toMatch(/grupos_elegibles AS \([\s\S]*FROM inscripciones_elegibles e[\s\S]*controles AS \([\s\S]*FROM inscripciones_elegibles e[\s\S]*respuestas AS \([\s\S]*FROM grupos_elegibles e/);
    expect(sql).toMatch(/JOIN public\.encuesta_control_envio c[\s\S]*JOIN public\.encuesta_estudiantil_respuestas r/);
    expect(sql).not.toMatch(/student_cd07_responses|DROP FUNCTION|GRANT EXECUTE|EXCEPTION WHEN/);
  });
});
