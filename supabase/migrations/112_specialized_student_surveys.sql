-- Specialized student surveys PP-04, SIM-05 and CC-06 join CD-07 (migration 111).
-- All four use 20 required answers on the same 1-5 scale as the general form plus
-- an optional comment, and score as (mean - 1) * 25. Groups opt in through
-- grupos.instrumento_encuesta; no group is switched by this migration.

ALTER TABLE public.grupos
  DROP CONSTRAINT IF EXISTS grupos_instrumento_encuesta_check;
ALTER TABLE public.grupos
  ADD CONSTRAINT grupos_instrumento_encuesta_check
  CHECK (instrumento_encuesta IN ('general-19', 'cd07-v1', 'pp04-v1', 'sim05-v1', 'cc06-v1'));

COMMENT ON COLUMN public.grupos.instrumento_encuesta IS
  'Student survey form: general-19 (default), cd07-v1 (cultural/sport workshops), pp04-v1 (professional practice), sim05-v1 (clinical simulation) or cc06-v1 (clinical field supervision).';

ALTER TABLE public.encuesta_estudiantil_respuestas
  RENAME COLUMN respuestas_cd07 TO respuestas_instrumento;

ALTER TABLE public.encuesta_estudiantil_respuestas
  DROP CONSTRAINT IF EXISTS encuesta_estudiantil_instrumento_forma;
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD CONSTRAINT encuesta_estudiantil_instrumento_forma CHECK (
    (
      instrumento = 'general-19'
      AND respuestas_instrumento IS NULL
      AND num_nulls(calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad) = 0
    )
    OR (
      instrumento IN ('cd07-v1', 'pp04-v1', 'sim05-v1', 'cc06-v1')
      AND num_nonnulls(calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad) = 0
      AND array_ndims(respuestas_instrumento) = 1
      AND cardinality(respuestas_instrumento) = 20
      AND array_position(respuestas_instrumento, NULL) IS NULL
      AND 1 <= ALL (respuestas_instrumento)
      AND 5 >= ALL (respuestas_instrumento)
    )
  );

CREATE OR REPLACE FUNCTION public.enviar_encuesta_estudiante_instrumento(p_grupo_id integer, p_instrumento text, p_respuestas jsonb, p_comentario text DEFAULT NULL::text)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_estudiante_id INTEGER; v_docente_id INTEGER; v_cuatrimestre_id INTEGER; v_values SMALLINT[]; v_habilitada BOOLEAN; v_instrumento TEXT;
BEGIN
  SELECT u.entidad_id INTO v_estudiante_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'estudiante' AND u.activo IS TRUE;
  IF v_estudiante_id IS NULL THEN RAISE EXCEPTION 'student required' USING ERRCODE = '42501'; END IF;
  IF p_instrumento IS NULL OR p_instrumento NOT IN ('cd07-v1', 'pp04-v1', 'sim05-v1', 'cc06-v1') THEN
    RETURN QUERY SELECT 'wrong_instrument'::TEXT; RETURN;
  END IF;
  IF p_grupo_id IS NULL OR p_grupo_id <= 0 OR jsonb_typeof(p_respuestas) <> 'array' OR jsonb_array_length(p_respuestas) <> 20
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_respuestas) x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') !~ '^[1-5]$') THEN
    RETURN QUERY SELECT 'invalid_answers'::TEXT; RETURN;
  END IF;
  SELECT array_agg((x #>> '{}')::SMALLINT ORDER BY ordinality) INTO v_values FROM jsonb_array_elements(p_respuestas) WITH ORDINALITY AS t(x, ordinality);
  SELECT g.docente_id, g.cuatrimestre_id, g.encuesta_estudiantil_habilitada, g.instrumento_encuesta INTO v_docente_id, v_cuatrimestre_id, v_habilitada, v_instrumento FROM public.grupos g JOIN public.cuatrimestres c ON c.id = g.cuatrimestre_id AND c.activo IS TRUE AND COALESCE(c.cerrado, false) IS FALSE WHERE g.id = p_grupo_id AND g.activo IS TRUE;
  IF v_docente_id IS NULL THEN RETURN QUERY SELECT 'no_active_cycle'::TEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inscripciones i WHERE i.estudiante_id = v_estudiante_id AND i.grupo_id = p_grupo_id AND i.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.encuesta_control_envio c WHERE c.estudiante_id = v_estudiante_id AND c.grupo_id = p_grupo_id AND c.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'already_submitted'::TEXT; RETURN; END IF;
  IF v_habilitada IS NOT TRUE THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF v_instrumento IS DISTINCT FROM p_instrumento THEN RETURN QUERY SELECT 'wrong_instrument'::TEXT; RETURN; END IF;
  IF length(COALESCE(p_comentario, '')) > 2000 THEN RETURN QUERY SELECT 'invalid_comment'::TEXT; RETURN; END IF;
  INSERT INTO public.encuesta_estudiantil_respuestas (docente_id, grupo_id, cuatrimestre_id, instrumento, respuestas_instrumento, comentario_abierto)
  VALUES (v_docente_id, p_grupo_id, v_cuatrimestre_id, p_instrumento, v_values, NULLIF(trim(COALESCE(p_comentario, '')), ''));
  INSERT INTO public.encuesta_control_envio (estudiante_id, grupo_id, cuatrimestre_id) VALUES (v_estudiante_id, p_grupo_id, v_cuatrimestre_id);
  RETURN QUERY SELECT 'completed'::TEXT;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'already_submitted'::TEXT;
END;
$function$;

-- Kept so the previously deployed CD-07 page keeps working until the new app is live.
CREATE OR REPLACE FUNCTION public.enviar_encuesta_estudiante_cd07(p_grupo_id integer, p_respuestas jsonb, p_comentario text DEFAULT NULL::text)
 RETURNS TABLE(status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT s.status FROM public.enviar_encuesta_estudiante_instrumento(p_grupo_id, 'cd07-v1', p_respuestas, p_comentario) s;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_scores_encuesta_estudiantil_nativa(p_cuatrimestre_id integer)
 RETURNS TABLE(cuatrimestre_id integer, docente_id integer, asignatura_id integer, grupo_id integer, respuestas_validas bigint, score_normalizado numeric, version_calculo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      AND r.instrumento = 'general-19'
      AND r.calidad_general BETWEEN 1 AND 5 AND r.item_plan_estudio BETWEEN 1 AND 5 AND r.item_trato_respeto BETWEEN 1 AND 5 AND r.item_asistencia BETWEEN 1 AND 5 AND r.item_puntualidad BETWEEN 1 AND 5 AND r.item_participacion BETWEEN 1 AND 5 AND r.item_dominio_materia BETWEEN 1 AND 5 AND r.item_plataforma_moodle BETWEEN 1 AND 5 AND r.item_pensamiento_critico BETWEEN 1 AND 5 AND r.item_desafio_intelectual BETWEEN 1 AND 5 AND r.item_claridad_objetivos BETWEEN 1 AND 5 AND r.item_lecturas_aprendizaje BETWEEN 1 AND 5 AND r.item_respeto_reglas BETWEEN 1 AND 5 AND r.item_interes_materia BETWEEN 1 AND 5 AND r.item_apoyos_didacticos BETWEEN 1 AND 5 AND r.item_actitudes_valores BETWEEN 1 AND 5 AND r.item_retroalimentacion BETWEEN 1 AND 5 AND r.item_criterios_evaluacion BETWEEN 1 AND 5 AND r.item_receptividad BETWEEN 1 AND 5
      AND (auth.role() = 'service_role' OR v_rol = 'superadmin' OR (v_rol = 'coordinador' AND public.can_manage_coordinated_teacher(g.docente_id, p_cuatrimestre_id)) OR (v_rol = 'docente' AND g.docente_id = v_docente_id))
    UNION ALL
    -- Specialized 20-item instruments: (mean - 1) * 25 on the shared 1-5 scale.
    SELECT g.cuatrimestre_id, g.docente_id, g.asignatura_id, g.id AS grupo_id,
      (((SELECT sum(v) FROM unnest(r.respuestas_instrumento) v) - 20)::NUMERIC / (20 * 4) * 100) AS response_score
    FROM public.encuesta_estudiantil_respuestas r JOIN public.grupos g ON g.id = r.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
      AND r.instrumento IN ('cd07-v1', 'pp04-v1', 'sim05-v1', 'cc06-v1')
      AND cardinality(r.respuestas_instrumento) = 20
      AND (auth.role() = 'service_role' OR v_rol = 'superadmin' OR (v_rol = 'coordinador' AND public.can_manage_coordinated_teacher(g.docente_id, p_cuatrimestre_id)) OR (v_rol = 'docente' AND g.docente_id = v_docente_id))
  ) SELECT r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id, COUNT(*)::BIGINT, AVG(r.response_score), 'native-19-v2'::TEXT FROM valid_responses r GROUP BY r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id ORDER BY r.docente_id, r.asignatura_id, r.grupo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enviar_encuesta_estudiante_instrumento(INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_encuesta_estudiante_instrumento(INTEGER, TEXT, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.enviar_encuesta_estudiante_cd07(INTEGER, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_encuesta_estudiante_cd07(INTEGER, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
