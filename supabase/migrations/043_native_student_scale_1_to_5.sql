-- Depends on 040_audit_and_logical_restore_points.sql (and therefore 041/042
-- may be applied first). This migration intentionally destroys legacy native
-- student test submissions authorized as unusable before enforcing 1--5.

-- DESTRUCTIVE: legacy native answers and completion controls cannot be mapped
-- truthfully from their mixed 1--6 / 1--4 scale. Do not remove this cleanup.
DELETE FROM public.encuesta_estudiantil_respuestas;
DELETE FROM public.encuesta_control_envio;

-- The final-score cache is derived data. Remove its obsolete EE contribution
-- while retaining the other instrument scores and refresh the aggregate view.
UPDATE public.calificaciones_finales cf
SET score_encuesta_estudiantil = NULL,
    calificacion_final = CASE
      WHEN lower(cf.modalidad_snapshot) LIKE '%ejecutivo%' OR lower(cf.modalidad_snapshot) LIKE '%ingl%' THEN
        round(COALESCE(cf.score_coordinacion, 0) * 0.25 + COALESCE(cf.score_observacion, 0) * 0.30 + COALESCE(cf.score_autoevaluacion, 0) * 0.05)
      ELSE round(COALESCE(cf.score_coordinacion, 0) * 0.20 + COALESCE(cf.score_planeacion, 0) * 0.15 + COALESCE(cf.score_observacion, 0) * 0.25 + COALESCE(cf.score_autoevaluacion, 0) * 0.05)
    END,
    num_instrumentos_completados = CASE
      WHEN lower(cf.modalidad_snapshot) LIKE '%ejecutivo%' OR lower(cf.modalidad_snapshot) LIKE '%ingl%' THEN
        (cf.score_coordinacion IS NOT NULL)::INT + (cf.score_observacion IS NOT NULL)::INT + (cf.score_autoevaluacion IS NOT NULL)::INT
      ELSE
        (cf.score_coordinacion IS NOT NULL)::INT + (cf.score_planeacion IS NOT NULL)::INT + (cf.score_observacion IS NOT NULL)::INT + (cf.score_autoevaluacion IS NOT NULL)::INT
    END,
    categoria_final = 'Parcial',
    version_calculo = 'native-19-v2-scale-reset',
    calculada_en = now();

UPDATE public.calificaciones_finales
SET categoria_final = 'No iniciado'
WHERE num_instrumentos_completados = 0;

ALTER TABLE public.encuesta_estudiantil_respuestas
  ALTER COLUMN calidad_general SET NOT NULL,
  ALTER COLUMN item_plan_estudio SET NOT NULL,
  ALTER COLUMN item_trato_respeto SET NOT NULL,
  ALTER COLUMN item_asistencia SET NOT NULL,
  ALTER COLUMN item_puntualidad SET NOT NULL,
  ALTER COLUMN item_participacion SET NOT NULL,
  ALTER COLUMN item_dominio_materia SET NOT NULL,
  ALTER COLUMN item_plataforma_moodle SET NOT NULL,
  ALTER COLUMN item_pensamiento_critico SET NOT NULL,
  ALTER COLUMN item_desafio_intelectual SET NOT NULL,
  ALTER COLUMN item_claridad_objetivos SET NOT NULL,
  ALTER COLUMN item_lecturas_aprendizaje SET NOT NULL,
  ALTER COLUMN item_respeto_reglas SET NOT NULL,
  ALTER COLUMN item_interes_materia SET NOT NULL,
  ALTER COLUMN item_apoyos_didacticos SET NOT NULL,
  ALTER COLUMN item_actitudes_valores SET NOT NULL,
  ALTER COLUMN item_retroalimentacion SET NOT NULL,
  ALTER COLUMN item_criterios_evaluacion SET NOT NULL,
  ALTER COLUMN item_receptividad SET NOT NULL,
  ADD CONSTRAINT encuesta_estudiantil_calidad_general_1_5 CHECK (calidad_general BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_plan_estudio_1_5 CHECK (item_plan_estudio BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_trato_respeto_1_5 CHECK (item_trato_respeto BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_asistencia_1_5 CHECK (item_asistencia BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_puntualidad_1_5 CHECK (item_puntualidad BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_participacion_1_5 CHECK (item_participacion BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_dominio_materia_1_5 CHECK (item_dominio_materia BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_plataforma_moodle_1_5 CHECK (item_plataforma_moodle BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_pensamiento_critico_1_5 CHECK (item_pensamiento_critico BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_desafio_intelectual_1_5 CHECK (item_desafio_intelectual BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_claridad_objetivos_1_5 CHECK (item_claridad_objetivos BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_lecturas_aprendizaje_1_5 CHECK (item_lecturas_aprendizaje BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_respeto_reglas_1_5 CHECK (item_respeto_reglas BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_interes_materia_1_5 CHECK (item_interes_materia BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_apoyos_didacticos_1_5 CHECK (item_apoyos_didacticos BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_actitudes_valores_1_5 CHECK (item_actitudes_valores BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_retroalimentacion_1_5 CHECK (item_retroalimentacion BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_criterios_evaluacion_1_5 CHECK (item_criterios_evaluacion BETWEEN 1 AND 5),
  ADD CONSTRAINT encuesta_estudiantil_item_receptividad_1_5 CHECK (item_receptividad BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.obtener_scores_encuesta_estudiantil_nativa(p_cuatrimestre_id INTEGER)
RETURNS TABLE(cuatrimestre_id INTEGER, docente_id INTEGER, asignatura_id INTEGER, grupo_id INTEGER, respuestas_validas BIGINT, score_normalizado NUMERIC, version_calculo TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_rol VARCHAR(20); v_docente_id INT;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT u.rol, u.entidad_id INTO v_rol, v_docente_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.activo IS TRUE;
    IF v_rol IS NULL OR v_rol NOT IN ('superadmin', 'coordinador', 'observador', 'docente') THEN RAISE EXCEPTION 'authorized role required' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY
  WITH valid_responses AS (
    SELECT g.cuatrimestre_id, g.docente_id, g.asignatura_id, g.id AS grupo_id,
      ((r.calidad_general + r.item_plan_estudio + r.item_trato_respeto + r.item_asistencia + r.item_puntualidad + r.item_participacion + r.item_dominio_materia + r.item_plataforma_moodle + r.item_pensamiento_critico + r.item_desafio_intelectual + r.item_claridad_objetivos + r.item_lecturas_aprendizaje + r.item_respeto_reglas + r.item_interes_materia + r.item_apoyos_didacticos + r.item_actitudes_valores + r.item_retroalimentacion + r.item_criterios_evaluacion + r.item_receptividad - 19)::NUMERIC / (19 * 4) * 100) AS response_score
    FROM public.encuesta_estudiantil_respuestas r
    JOIN public.grupos g ON g.id = r.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
      AND r.calidad_general BETWEEN 1 AND 5 AND r.item_plan_estudio BETWEEN 1 AND 5 AND r.item_trato_respeto BETWEEN 1 AND 5
      AND r.item_asistencia BETWEEN 1 AND 5 AND r.item_puntualidad BETWEEN 1 AND 5 AND r.item_participacion BETWEEN 1 AND 5
      AND r.item_dominio_materia BETWEEN 1 AND 5 AND r.item_plataforma_moodle BETWEEN 1 AND 5 AND r.item_pensamiento_critico BETWEEN 1 AND 5
      AND r.item_desafio_intelectual BETWEEN 1 AND 5 AND r.item_claridad_objetivos BETWEEN 1 AND 5 AND r.item_lecturas_aprendizaje BETWEEN 1 AND 5
      AND r.item_respeto_reglas BETWEEN 1 AND 5 AND r.item_interes_materia BETWEEN 1 AND 5 AND r.item_apoyos_didacticos BETWEEN 1 AND 5
      AND r.item_actitudes_valores BETWEEN 1 AND 5 AND r.item_retroalimentacion BETWEEN 1 AND 5 AND r.item_criterios_evaluacion BETWEEN 1 AND 5
      AND r.item_receptividad BETWEEN 1 AND 5
      AND (auth.role() = 'service_role' OR v_rol = 'superadmin' OR (v_rol IN ('coordinador', 'observador') AND EXISTS (SELECT 1 FROM public.coordinador_docentes cd WHERE cd.coordinador_id = auth.uid() AND cd.docente_id = g.docente_id AND cd.cuatrimestre_id = p_cuatrimestre_id)) OR (v_rol = 'docente' AND g.docente_id = v_docente_id))
  )
  SELECT r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id, COUNT(*)::BIGINT, AVG(r.response_score), 'native-19-v2'::TEXT
  FROM valid_responses r GROUP BY r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id ORDER BY r.docente_id, r.asignatura_id, r.grupo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_encuesta_estudiante(p_grupo_id INTEGER, p_respuestas JSONB, p_comentario TEXT DEFAULT NULL)
RETURNS TABLE(status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_estudiante_id INTEGER; v_docente_id INTEGER; v_cuatrimestre_id INTEGER; v_values INTEGER[];
BEGIN
  SELECT u.entidad_id INTO v_estudiante_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'estudiante' AND u.activo IS TRUE;
  IF v_estudiante_id IS NULL THEN RAISE EXCEPTION 'student required' USING ERRCODE = '42501'; END IF;
  IF p_grupo_id IS NULL OR p_grupo_id <= 0 OR jsonb_typeof(p_respuestas) <> 'array' OR jsonb_array_length(p_respuestas) <> 19
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_respuestas) x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') !~ '^[1-5]$') THEN
    RETURN QUERY SELECT 'invalid_answers'::TEXT; RETURN;
  END IF;
  SELECT array_agg((x #>> '{}')::INTEGER ORDER BY ordinality) INTO v_values FROM jsonb_array_elements(p_respuestas) WITH ORDINALITY AS t(x, ordinality);
  SELECT g.docente_id, g.cuatrimestre_id INTO v_docente_id, v_cuatrimestre_id FROM public.grupos g JOIN public.cuatrimestres c ON c.id = g.cuatrimestre_id AND c.activo IS TRUE AND COALESCE(c.cerrado, false) IS FALSE WHERE g.id = p_grupo_id AND g.activo IS TRUE;
  IF v_docente_id IS NULL THEN RETURN QUERY SELECT 'no_active_cycle'::TEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inscripciones i WHERE i.estudiante_id = v_estudiante_id AND i.grupo_id = p_grupo_id AND i.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.encuesta_control_envio c WHERE c.estudiante_id = v_estudiante_id AND c.grupo_id = p_grupo_id AND c.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'already_submitted'::TEXT; RETURN; END IF;
  IF length(COALESCE(p_comentario, '')) > 500 THEN RETURN QUERY SELECT 'invalid_comment'::TEXT; RETURN; END IF;
  INSERT INTO public.encuesta_estudiantil_respuestas (docente_id, grupo_id, cuatrimestre_id, calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad, comentario_abierto)
  VALUES (v_docente_id, p_grupo_id, v_cuatrimestre_id, v_values[1], v_values[2], v_values[3], v_values[4], v_values[5], v_values[6], v_values[7], v_values[8], v_values[9], v_values[10], v_values[11], v_values[12], v_values[13], v_values[14], v_values[15], v_values[16], v_values[17], v_values[18], v_values[19], NULLIF(trim(COALESCE(p_comentario, '')), ''));
  INSERT INTO public.encuesta_control_envio (estudiante_id, grupo_id, cuatrimestre_id) VALUES (v_estudiante_id, p_grupo_id, v_cuatrimestre_id);
  RETURN QUERY SELECT 'completed'::TEXT;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'already_submitted'::TEXT;
END;
$function$;

SELECT public.refrescar_resultados_agregados();

REVOKE ALL ON FUNCTION public.obtener_scores_encuesta_estudiantil_nativa(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enviar_encuesta_estudiante(INTEGER, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_scores_encuesta_estudiantil_nativa(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enviar_encuesta_estudiante(INTEGER, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
