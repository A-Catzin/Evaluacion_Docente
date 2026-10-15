import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/109_cd07_native_score_fixture_guard.sql';
const sql = () => readFileSync(path, 'utf8');

describe('native score source replacement', () => {
  it('retains deployed one-argument signature, security and authorization', () => {
    const body = sql();
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION "public"\."obtener_scores_encuesta_estudiantil_nativa"\("p_cuatrimestre_id" integer\) RETURNS TABLE\("cuatrimestre_id" integer, "docente_id" integer, "asignatura_id" integer, "grupo_id" integer, "respuestas_validas" bigint, "score_normalizado" numeric, "version_calculo" "text"\)/);
    expect(body).toMatch(/LANGUAGE "plpgsql" STABLE SECURITY DEFINER\s+SET "search_path" TO ''/);
    expect(body).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(body).toContain('COALESCE(u.activo, true)');
    expect(body).toContain("v_rol NOT IN ('superadmin', 'coordinador', 'docente')");
    expect(body).toContain('public.can_manage_coordinated_teacher(g.docente_id, p_cuatrimestre_id)');
    expect(body).toContain("(v_rol = 'docente' AND g.docente_id = v_docente_id)");
    expect(body).not.toMatch(/\bobservador\b|\bGRANT\b|\bREVOKE\b/i);
  });

  it('keeps the 19-answer formula, validation and version', () => {
    const body = sql();
    const names = ['calidad_general', 'item_plan_estudio', 'item_trato_respeto', 'item_asistencia', 'item_puntualidad', 'item_participacion', 'item_dominio_materia', 'item_plataforma_moodle', 'item_pensamiento_critico', 'item_desafio_intelectual', 'item_claridad_objetivos', 'item_lecturas_aprendizaje', 'item_respeto_reglas', 'item_interes_materia', 'item_apoyos_didacticos', 'item_actitudes_valores', 'item_retroalimentacion', 'item_criterios_evaluacion', 'item_receptividad'];
    expect(body).toContain(`((${names.map(n => `r.${n}`).join(' + ')} - 19)::NUMERIC / (19 * 4) * 100)`);
    for (const name of names) expect(body).toContain(`r.${name} BETWEEN 1 AND 5`);
    expect(body).toContain("AVG(r.response_score), 'native-19-v2'::TEXT");
  });

  it('filters exact assignment in valid_responses before aggregation and never catches classifier errors', () => {
    const body = sql();
    const source = body.slice(body.indexOf('WITH valid_responses AS ('), body.indexOf(') SELECT r.cuatrimestre_id'));
    expect(source).toContain("AND public.cd07_verified_assignment_origin(g.cuatrimestre_id, g.id, g.docente_id, g.asignatura_id) IN ('general-19', 'cd07-real')");
    expect(source.indexOf('cd07_verified_assignment_origin')).toBeGreaterThan(source.indexOf('WHERE r.cuatrimestre_id'));
    expect(body).not.toMatch(/EXCEPTION WHEN|COALESCE\s*\(\s*public\.cd07_verified_assignment_origin/i);
    expect(body.match(/cd07_verified_assignment_origin/g)).toHaveLength(1);
  });
});
