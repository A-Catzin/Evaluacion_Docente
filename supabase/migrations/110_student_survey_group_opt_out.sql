-- Per-group switch for the native student survey.
-- Cultura y Deporte 27-1 groups (evaluaciones_profesores8.csv) have no survey form of
-- their own, so the student survey is disabled for them. grupos.activo is NOT used
-- because it also drives planning, observation and teacher responsibility flows.
-- Responses already submitted for these groups are kept and still counted.

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS encuesta_estudiantil_habilitada BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.grupos.encuesta_estudiantil_habilitada IS
  'FALSE hides the student survey for this group and rejects new submissions; existing responses are preserved.';

UPDATE public.grupos g
SET encuesta_estudiantil_habilitada = FALSE
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
DECLARE v_estudiante_id INTEGER; v_docente_id INTEGER; v_cuatrimestre_id INTEGER; v_values INTEGER[]; v_habilitada BOOLEAN;
BEGIN
  SELECT u.entidad_id INTO v_estudiante_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'estudiante' AND u.activo IS TRUE;
  IF v_estudiante_id IS NULL THEN RAISE EXCEPTION 'student required' USING ERRCODE = '42501'; END IF;
  IF p_grupo_id IS NULL OR p_grupo_id <= 0 OR jsonb_typeof(p_respuestas) <> 'array' OR jsonb_array_length(p_respuestas) <> 19
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_respuestas) x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') !~ '^[1-5]$') THEN
    RETURN QUERY SELECT 'invalid_answers'::TEXT; RETURN;
  END IF;
  SELECT array_agg((x #>> '{}')::INTEGER ORDER BY ordinality) INTO v_values FROM jsonb_array_elements(p_respuestas) WITH ORDINALITY AS t(x, ordinality);
  SELECT g.docente_id, g.cuatrimestre_id, g.encuesta_estudiantil_habilitada INTO v_docente_id, v_cuatrimestre_id, v_habilitada FROM public.grupos g JOIN public.cuatrimestres c ON c.id = g.cuatrimestre_id AND c.activo IS TRUE AND COALESCE(c.cerrado, false) IS FALSE WHERE g.id = p_grupo_id AND g.activo IS TRUE;
  IF v_docente_id IS NULL THEN RETURN QUERY SELECT 'no_active_cycle'::TEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inscripciones i WHERE i.estudiante_id = v_estudiante_id AND i.grupo_id = p_grupo_id AND i.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.encuesta_control_envio c WHERE c.estudiante_id = v_estudiante_id AND c.grupo_id = p_grupo_id AND c.cuatrimestre_id = v_cuatrimestre_id) THEN RETURN QUERY SELECT 'already_submitted'::TEXT; RETURN; END IF;
  -- Survey disabled for this group: reported as not evaluable without changing the API contract.
  IF v_habilitada IS NOT TRUE THEN RETURN QUERY SELECT 'not_enrolled'::TEXT; RETURN; END IF;
  IF length(COALESCE(p_comentario, '')) > 500 THEN RETURN QUERY SELECT 'invalid_comment'::TEXT; RETURN; END IF;
  INSERT INTO public.encuesta_estudiantil_respuestas (docente_id, grupo_id, cuatrimestre_id, calidad_general, item_plan_estudio, item_trato_respeto, item_asistencia, item_puntualidad, item_participacion, item_dominio_materia, item_plataforma_moodle, item_pensamiento_critico, item_desafio_intelectual, item_claridad_objetivos, item_lecturas_aprendizaje, item_respeto_reglas, item_interes_materia, item_apoyos_didacticos, item_actitudes_valores, item_retroalimentacion, item_criterios_evaluacion, item_receptividad, comentario_abierto)
  VALUES (v_docente_id, p_grupo_id, v_cuatrimestre_id, v_values[1], v_values[2], v_values[3], v_values[4], v_values[5], v_values[6], v_values[7], v_values[8], v_values[9], v_values[10], v_values[11], v_values[12], v_values[13], v_values[14], v_values[15], v_values[16], v_values[17], v_values[18], v_values[19], NULLIF(trim(COALESCE(p_comentario, '')), ''));
  INSERT INTO public.encuesta_control_envio (estudiante_id, grupo_id, cuatrimestre_id) VALUES (v_estudiante_id, p_grupo_id, v_cuatrimestre_id);
  RETURN QUERY SELECT 'completed'::TEXT;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'already_submitted'::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_progreso_encuesta_estudiantil_nativa(p_cuatrimestre_id integer)
 RETURNS TABLE(docente_id integer, inscripciones_elegibles bigint, controles_enviados bigint, respuestas_nativas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rol VARCHAR(20);
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;

  SELECT u.rol
  INTO v_rol
  FROM public.usuarios u
  WHERE u.id = auth.uid()
    AND u.activo IS TRUE;

  IF v_rol IS NULL OR v_rol NOT IN ('superadmin', 'coordinador') THEN
    RAISE EXCEPTION 'staff role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cuatrimestres c
    WHERE c.id = p_cuatrimestre_id
  ) THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH inscripciones_elegibles AS (
    SELECT
      i.id AS inscripcion_id,
      i.estudiante_id,
      g.id AS grupo_id,
      g.docente_id
    FROM public.inscripciones i
    JOIN public.grupos g
      ON g.id = i.grupo_id
      AND g.cuatrimestre_id = p_cuatrimestre_id
      AND g.activo IS TRUE
    JOIN public.docentes d ON d.id = g.docente_id
    JOIN public.asignaturas a ON a.id = g.asignatura_id
    WHERE i.cuatrimestre_id = p_cuatrimestre_id
      -- Disabled surveys only count enrollments that were already answered.
      AND (
        g.encuesta_estudiantil_habilitada IS TRUE
        OR EXISTS (
          SELECT 1
          FROM public.encuesta_control_envio ce
          WHERE ce.estudiante_id = i.estudiante_id
            AND ce.grupo_id = g.id
            AND ce.cuatrimestre_id = p_cuatrimestre_id
        )
      )
  ),
  grupos_elegibles AS (
    SELECT DISTINCT e.docente_id, e.grupo_id
    FROM inscripciones_elegibles e
  ),
  controles AS (
    SELECT e.docente_id, count(c.id) AS total
    FROM inscripciones_elegibles e
    JOIN public.encuesta_control_envio c
      ON c.estudiante_id = e.estudiante_id
      AND c.grupo_id = e.grupo_id
      AND c.cuatrimestre_id = p_cuatrimestre_id
    GROUP BY e.docente_id
  ),
  respuestas AS (
    SELECT e.docente_id, count(r.id) AS total
    FROM grupos_elegibles e
    JOIN public.encuesta_estudiantil_respuestas r
      ON r.docente_id = e.docente_id
      AND r.grupo_id = e.grupo_id
      AND r.cuatrimestre_id = p_cuatrimestre_id
    GROUP BY e.docente_id
  )
  SELECT
    e.docente_id,
    count(e.inscripcion_id) AS inscripciones_elegibles,
    COALESCE(c.total, 0) AS controles_enviados,
    COALESCE(r.total, 0) AS respuestas_nativas
  FROM inscripciones_elegibles e
  LEFT JOIN controles c ON c.docente_id = e.docente_id
  LEFT JOIN respuestas r ON r.docente_id = e.docente_id
  GROUP BY e.docente_id, c.total, r.total
  ORDER BY e.docente_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
