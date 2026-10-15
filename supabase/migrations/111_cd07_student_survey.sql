-- CD-07 student survey (SED-360-INST-EST-CD-07-V1.1) for Cultura y Deporte 27-1.
-- grupos.instrumento_encuesta selects the form per group. CD-07 answers live in the
-- same response table (instrumento + respuestas_cd07) so progress, comments,
-- recalculation and test-cycle deletion keep working unchanged. General history is
-- untouched; one submission per student/group/cycle stays enforced by
-- encuesta_control_envio across both instruments.

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS instrumento_encuesta VARCHAR(20) NOT NULL DEFAULT 'general-19';

ALTER TABLE public.grupos
  DROP CONSTRAINT IF EXISTS grupos_instrumento_encuesta_check;
ALTER TABLE public.grupos
  ADD CONSTRAINT grupos_instrumento_encuesta_check
  CHECK (instrumento_encuesta IN ('general-19', 'cd07-v1'));

COMMENT ON COLUMN public.grupos.instrumento_encuesta IS
  'Student survey form for this group: general-19 (default) or cd07-v1 (cultural, artistic and sport workshops).';

ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD COLUMN IF NOT EXISTS instrumento VARCHAR(20) NOT NULL DEFAULT 'general-19',
  ADD COLUMN IF NOT EXISTS respuestas_cd07 SMALLINT[];

ALTER TABLE public.encuesta_estudiantil_respuestas
  ALTER COLUMN calidad_general DROP NOT NULL,
  ALTER COLUMN item_plan_estudio DROP NOT NULL,
  ALTER COLUMN item_trato_respeto DROP NOT NULL,
  ALTER COLUMN item_asistencia DROP NOT NULL,
  ALTER COLUMN item_puntualidad DROP NOT NULL,
  ALTER COLUMN item_participacion DROP NOT NULL,
  ALTER COLUMN item_dominio_materia DROP NOT NULL,
  ALTER COLUMN item_plataforma_moodle DROP NOT NULL,
  ALTER COLUMN item_pensamiento_critico DROP NOT NULL,
  ALTER COLUMN item_desafio_intelectual DROP NOT NULL,
  ALTER COLUMN item_claridad_objetivos DROP NOT NULL,
  ALTER COLUMN item_lecturas_aprendizaje DROP NOT NULL,
  ALTER COLUMN item_respeto_reglas DROP NOT NULL,
  ALTER COLUMN item_interes_materia DROP NOT NULL,
  ALTER COLUMN item_apoyos_didacticos DROP NOT NULL,
  ALTER COLUMN item_actitudes_valores DROP NOT NULL,
  ALTER COLUMN item_retroalimentacion DROP NOT NULL,
  ALTER COLUMN item_criterios_evaluacion DROP NOT NULL,
  ALTER COLUMN item_receptividad DROP NOT NULL;

ALTER TABLE public.encuesta_estudiantil_respuestas
  DROP CONSTRAINT IF EXISTS encuesta_estudiantil_instrumento_forma;
-- General rows keep all 19 columns required; CD-07 rows carry exactly 20 values 1-5.
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD CONSTRAINT encuesta_estudiantil_instrumento_forma CHECK (
    (
      instrumento = 'general-19'
      AND respuestas_cd07 IS NULL
      AND num_nulls(calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad) = 0
    )
    OR (
      instrumento = 'cd07-v1'
      AND num_nonnulls(calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad) = 0
      AND array_ndims(respuestas_cd07) = 1
      AND cardinality(respuestas_cd07) = 20
      AND array_position(respuestas_cd07, NULL) IS NULL
      AND 1 <= ALL (respuestas_cd07)
      AND 5 >= ALL (respuestas_cd07)
    )
  );

-- Cultura y Deporte 27-1 assignment groups move to CD-07 and are re-enabled
-- (migration 110 had disabled them while no form existed).
UPDATE public.grupos g
SET instrumento_encuesta = 'cd07-v1',
    encuesta_estudiantil_habilitada = TRUE
WHERE g.cuatrimestre_id = 11
  AND g.plan_normalizado = 'DEPORTES'
  AND g.id IN (910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920,
               921, 922, 923, 924, 925, 926, 927, 928, 929, 930, 931);

CREATE OR REPLACE FUNCTION public.obtener_evaluaciones_estudiante_actual()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_estudiante_id INT;
  v_cuatrimestre_id INT;
  v_cuatrimestre_clave TEXT;
  v_cuatrimestre_nombre TEXT;
  v_evaluaciones JSONB;
BEGIN
  SELECT u.entidad_id
  INTO v_estudiante_id
  FROM public.usuarios u
  JOIN public.estudiantes e ON e.id = u.entidad_id AND e.activo IS TRUE
  WHERE u.id = auth.uid()
    AND u.rol = 'estudiante'
    AND u.activo IS TRUE;

  IF v_estudiante_id IS NULL THEN
    RAISE EXCEPTION 'student identity required' USING ERRCODE = '42501';
  END IF;

  -- activo selects the cycle shown by this first release; cerrado is not an evaluation-window flag.
  SELECT c.id, c.clave, c.nombre
  INTO v_cuatrimestre_id, v_cuatrimestre_clave, v_cuatrimestre_nombre
  FROM public.cuatrimestres c
  WHERE c.activo IS TRUE
  ORDER BY c.fecha_inicio DESC, c.id DESC
  LIMIT 1;

  IF v_cuatrimestre_id IS NULL THEN
    RETURN jsonb_build_object('cycle', NULL, 'evaluations', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'groupId', g.id,
        'teacherName', NULLIF(BTRIM(concat_ws(' ', d.nombre, d.apellidos)), ''),
        'subjectKey', a.clave,
        'subjectName', a.nombre,
        'groupKey', COALESCE(NULLIF(BTRIM(g.grupo_normalizado), ''), NULLIF(BTRIM(g.clave), ''), 'Sin grupo'),
        'plan', NULLIF(BTRIM(g.plan_normalizado), ''),
        'modality', COALESCE(NULLIF(BTRIM(g.modalidad), ''), NULLIF(BTRIM(d.modalidad), '')),
        'instrument', g.instrumento_encuesta,
        'completed', control.id IS NOT NULL
      )
      ORDER BY a.nombre, g.clave, g.id
    ),
    '[]'::jsonb
  )
  INTO v_evaluaciones
  -- Eligibility requires the exact assignment-group enrollment. A base roster group
  -- without a mirrored assignment enrollment is intentionally not inferred by text.
  FROM public.inscripciones i
  JOIN public.grupos g
    ON g.id = i.grupo_id
    AND g.cuatrimestre_id = v_cuatrimestre_id
    AND g.activo IS TRUE
  JOIN public.docentes d ON d.id = g.docente_id
  JOIN public.asignaturas a ON a.id = g.asignatura_id
  LEFT JOIN public.encuesta_control_envio control
    ON control.estudiante_id = v_estudiante_id
    AND control.grupo_id = g.id
    AND control.cuatrimestre_id = v_cuatrimestre_id
  WHERE i.estudiante_id = v_estudiante_id
    AND i.cuatrimestre_id = v_cuatrimestre_id
    -- Disabled surveys stay visible only when the student already answered them.
    AND (g.encuesta_estudiantil_habilitada IS TRUE OR control.id IS NOT NULL);

  RETURN jsonb_build_object(
    'cycle', jsonb_build_object('id', v_cuatrimestre_id, 'key', v_cuatrimestre_clave, 'name', v_cuatrimestre_nombre),
    'evaluations', v_evaluaciones
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_encuesta_estudiante(p_grupo_id integer, p_respuestas jsonb, p_comentario text DEFAULT NULL::text)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_estudiante_id INTEGER; v_docente_id INTEGER; v_cuatrimestre_id INTEGER; v_values INTEGER[]; v_habilitada BOOLEAN; v_instrumento TEXT;
BEGIN
  SELECT u.entidad_id INTO v_estudiante_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'estudiante' AND u.activo IS TRUE;
  IF v_estudiante_id IS NULL THEN RAISE EXCEPTION 'student required' USING ERRCODE = '42501'; END IF;
  IF p_grupo_id IS NULL OR p_grupo_id <= 0 OR jsonb_typeof(p_respuestas) <> 'array' OR jsonb_array_length(p_respuestas) <> 19
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_respuestas) x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') !~ '^[1-5]$') THEN
    RETURN QUERY SELECT 'invalid_answers'::TEXT; RETURN;
  END IF;
  SELECT array_agg((x #>> '{}')::INTEGER ORDER BY ordinality) INTO v_values FROM jsonb_array_elements(p_respuestas) WITH ORDINALITY AS t(x, ordinality);
  SELECT g.docente_id, g.cuatrimestre_id, g.encuesta_estudiantil_habilitada, g.instrumento_encuesta INTO v_docente_id, v_cuatrimestre_id, v_habilitada, v_instrumento FROM public.grupos g JOIN public.cuatrimestres c ON c.id = g.cuatrimestre_id AND c.activo IS TRUE AND COALESCE(c.cerrado, false) IS FALSE WHERE g.id = p_grupo_id AND g.activo IS TRUE;
  IF v_docente_id IS NULL THEN RETURN QUERY SELECT 'no_active_cycle'::TEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inscripciones i WHERE i.estudiante_id = v_estudiante_id AND i.grupo_id = p_grupo_id AND i.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.encuesta_control_envio c WHERE c.estudiante_id = v_estudiante_id AND c.grupo_id = p_grupo_id AND c.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'already_submitted'::TEXT; RETURN; END IF;
  -- Survey disabled for this group: reported as not evaluable without changing the API contract.
  IF v_habilitada IS NOT TRUE THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF v_instrumento IS DISTINCT FROM 'general-19' THEN RETURN QUERY SELECT 'wrong_instrument'::TEXT; RETURN; END IF;
  IF length(COALESCE(p_comentario, '')) > 500 THEN RETURN QUERY SELECT 'invalid_comment'::TEXT; RETURN; END IF;
  INSERT INTO public.encuesta_estudiantil_respuestas (docente_id, grupo_id, cuatrimestre_id, calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad, comentario_abierto)
  VALUES (v_docente_id, p_grupo_id, v_cuatrimestre_id, v_values[1], v_values[2], v_values[3], v_values[4], v_values[5], v_values[6], v_values[7], v_values[8], v_values[9], v_values[10], v_values[11], v_values[12], v_values[13], v_values[14], v_values[15], v_values[16], v_values[17], v_values[18], v_values[19], NULLIF(trim(COALESCE(p_comentario, '')), ''));
  INSERT INTO public.encuesta_control_envio (estudiante_id, grupo_id, cuatrimestre_id) VALUES (v_estudiante_id, p_grupo_id, v_cuatrimestre_id);
  RETURN QUERY SELECT 'completed'::TEXT;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'already_submitted'::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_encuesta_estudiante_cd07(p_grupo_id integer, p_respuestas jsonb, p_comentario text DEFAULT NULL::text)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_estudiante_id INTEGER; v_docente_id INTEGER; v_cuatrimestre_id INTEGER; v_values SMALLINT[]; v_habilitada BOOLEAN; v_instrumento TEXT;
BEGIN
  SELECT u.entidad_id INTO v_estudiante_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'estudiante' AND u.activo IS TRUE;
  IF v_estudiante_id IS NULL THEN RAISE EXCEPTION 'student required' USING ERRCODE = '42501'; END IF;
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
  IF v_instrumento IS DISTINCT FROM 'cd07-v1' THEN RETURN QUERY SELECT 'wrong_instrument'::TEXT; RETURN; END IF;
  IF length(COALESCE(p_comentario, '')) > 2000 THEN RETURN QUERY SELECT 'invalid_comment'::TEXT; RETURN; END IF;
  INSERT INTO public.encuesta_estudiantil_respuestas (docente_id, grupo_id, cuatrimestre_id, instrumento, respuestas_cd07, comentario_abierto)
  VALUES (v_docente_id, p_grupo_id, v_cuatrimestre_id, 'cd07-v1', v_values, NULLIF(trim(COALESCE(p_comentario, '')), ''));
  INSERT INTO public.encuesta_control_envio (estudiante_id, grupo_id, cuatrimestre_id) VALUES (v_estudiante_id, p_grupo_id, v_cuatrimestre_id);
  RETURN QUERY SELECT 'completed'::TEXT;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'already_submitted'::TEXT;
END;
$function$;

-- CD-07 joins the same student indicator: (mean - 1) * 25 on the 1-5 scale, the
-- same normalization the general 19-item formula applies.
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
    SELECT g.cuatrimestre_id, g.docente_id, g.asignatura_id, g.id AS grupo_id,
      (((SELECT sum(v) FROM unnest(r.respuestas_cd07) v) - 20)::NUMERIC / (20 * 4) * 100) AS response_score
    FROM public.encuesta_estudiantil_respuestas r JOIN public.grupos g ON g.id = r.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
      AND r.instrumento = 'cd07-v1'
      AND cardinality(r.respuestas_cd07) = 20
      AND (auth.role() = 'service_role' OR v_rol = 'superadmin' OR (v_rol = 'coordinador' AND public.can_manage_coordinated_teacher(g.docente_id, p_cuatrimestre_id)) OR (v_rol = 'docente' AND g.docente_id = v_docente_id))
  ) SELECT r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id, COUNT(*)::BIGINT, AVG(r.response_score), 'native-19-v2'::TEXT FROM valid_responses r GROUP BY r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id ORDER BY r.docente_id, r.asignatura_id, r.grupo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enviar_encuesta_estudiante_cd07(INTEGER, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_encuesta_estudiante_cd07(INTEGER, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
