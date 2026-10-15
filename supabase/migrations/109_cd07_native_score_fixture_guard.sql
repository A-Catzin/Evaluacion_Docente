-- Forward-only replacement of deployed native score body; existing function ACL retained.
CREATE OR REPLACE FUNCTION "public"."obtener_scores_encuesta_estudiantil_nativa"("p_cuatrimestre_id" integer) RETURNS TABLE("cuatrimestre_id" integer, "docente_id" integer, "asignatura_id" integer, "grupo_id" integer, "respuestas_validas" bigint, "score_normalizado" numeric, "version_calculo" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_rol VARCHAR(20); v_docente_id INT;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023'; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT u.rol, u.entidad_id INTO v_rol, v_docente_id FROM public.usuarios u WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
    IF v_rol IS NULL OR v_rol NOT IN ('superadmin', 'coordinador', 'docente') THEN RAISE EXCEPTION 'authorized role required' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY
  WITH valid_responses AS (
    SELECT g.cuatrimestre_id, g.docente_id, g.asignatura_id, g.id AS grupo_id,
      ((r.calidad_general + r.item_plan_estudio + r.item_trato_respeto + r.item_asistencia + r.item_puntualidad + r.item_participacion + r.item_dominio_materia + r.item_plataforma_moodle + r.item_pensamiento_critico + r.item_desafio_intelectual + r.item_claridad_objetivos + r.item_lecturas_aprendizaje + r.item_respeto_reglas + r.item_interes_materia + r.item_apoyos_didacticos + r.item_actitudes_valores + r.item_retroalimentacion + r.item_criterios_evaluacion + r.item_receptividad - 19)::NUMERIC / (19 * 4) * 100) AS response_score
    FROM public.encuesta_estudiantil_respuestas r JOIN public.grupos g ON g.id = r.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
          AND public.cd07_verified_assignment_origin(g.cuatrimestre_id, g.id, g.docente_id, g.asignatura_id) IN ('general-19', 'cd07-real')
      AND r.calidad_general BETWEEN 1 AND 5 AND r.item_plan_estudio BETWEEN 1 AND 5 AND r.item_trato_respeto BETWEEN 1 AND 5 AND r.item_asistencia BETWEEN 1 AND 5 AND r.item_puntualidad BETWEEN 1 AND 5 AND r.item_participacion BETWEEN 1 AND 5 AND r.item_dominio_materia BETWEEN 1 AND 5 AND r.item_plataforma_moodle BETWEEN 1 AND 5 AND r.item_pensamiento_critico BETWEEN 1 AND 5 AND r.item_desafio_intelectual BETWEEN 1 AND 5 AND r.item_claridad_objetivos BETWEEN 1 AND 5 AND r.item_lecturas_aprendizaje BETWEEN 1 AND 5 AND r.item_respeto_reglas BETWEEN 1 AND 5 AND r.item_interes_materia BETWEEN 1 AND 5 AND r.item_apoyos_didacticos BETWEEN 1 AND 5 AND r.item_actitudes_valores BETWEEN 1 AND 5 AND r.item_retroalimentacion BETWEEN 1 AND 5 AND r.item_criterios_evaluacion BETWEEN 1 AND 5 AND r.item_receptividad BETWEEN 1 AND 5
      AND (auth.role() = 'service_role' OR v_rol = 'superadmin' OR (v_rol = 'coordinador' AND public.can_manage_coordinated_teacher(g.docente_id, p_cuatrimestre_id)) OR (v_rol = 'docente' AND g.docente_id = v_docente_id))
  ) SELECT r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id, COUNT(*)::BIGINT, AVG(r.response_score), 'native-19-v2'::TEXT FROM valid_responses r GROUP BY r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id ORDER BY r.docente_id, r.asignatura_id, r.grupo_id;
END;
$$;
