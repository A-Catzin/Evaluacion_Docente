import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(new URL('../../supabase/migrations/107_cd07_assignment_origin.sql', import.meta.url), 'utf8');

describe('internal CD-07 assignment origin (static SQL contract)', () => {
  it('has an exact four-key private stable definer boundary', () => {
    const text = sql();
    expect(text).toMatch(/CREATE FUNCTION public\.cd07_verified_assignment_origin\(p_cuatrimestre_id integer, p_grupo_id integer, p_docente_id integer, p_asignatura_id integer\)\s*RETURNS text/i);
    expect(text).toMatch(/STABLE\s+SECURITY DEFINER\s+SET search_path TO ''/i);
    expect(text).toMatch(/REVOKE ALL ON FUNCTION public\.cd07_verified_assignment_origin\(integer, integer, integer, integer\) FROM PUBLIC, anon, authenticated, service_role/i);
    expect(text).not.toMatch(/\b(?:GRANT|INSERT|UPDATE|DELETE|CREATE POLICY)\b/i);
  });

  it('checks positive identity, live exact assignment and open cycle', () => {
    const text = sql();
    for (const key of ['cuatrimestre', 'grupo', 'docente', 'asignatura']) {
      expect(text).toContain(`p_${key}_id <= 0`);
    }
    expect(text).toMatch(/FROM public\.grupos g\s+JOIN public\.cuatrimestres c ON c\.id = g\.cuatrimestre_id/i);
    for (const key of ['cuatrimestre', 'grupo', 'docente', 'asignatura']) {
      expect(text).toContain(`= p_${key}_id`);
    }
    expect(text).toMatch(/g\.activo IS TRUE/);
    expect(text).toMatch(/c\.activo IS TRUE/);
    expect(text).toMatch(/COALESCE\(c\.cerrado, false\) IS FALSE/);
    expect(text).toMatch(/RAISE EXCEPTION/);
  });

  it('checks both registries before selecting fixture, real, unavailable or general', () => {
    const text = sql();
    for (const table of ['student_cd07_real_assignment_manifest', 'student_cd07_fixture_authorization']) {
      expect(text).toContain(`public.${table}`);
    }
    expect(text).toMatch(/IF v_real_found AND v_fixture_found THEN\s+RAISE EXCEPTION/i);
    expect(text).toMatch(/IF v_fixture_found THEN\s+RETURN 'fixture'/i);
    expect(text).toMatch(/IF v_real_found THEN\s+IF v_real_active THEN\s+RETURN 'cd07-real';\s+END IF;\s+RETURN 'unavailable'/i);
    expect(text).toMatch(/RETURN 'general-19'/i);
    expect(text).toMatch(/assignment_revision/);
    expect(text).toMatch(/v_real\.docente_id IS DISTINCT FROM p_docente_id/);
    expect(text).toMatch(/v_fixture\.asignatura_id IS DISTINCT FROM p_asignatura_id/);
    expect(text).toMatch(/v_real\.instrument_code IS DISTINCT FROM 'SED-360-INST-EST-CD-07-V1\.1'/);
    expect(text).toMatch(/v_fixture\.assignment_revision IS NULL/);
    expect(text).toMatch(/instrument_code/);
    expect(text).not.toMatch(/\b(?:estudiante_id|respuestas|TEST-CD|nombre_grupo)\b/i);
  });
});
