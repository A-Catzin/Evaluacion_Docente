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
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_scores_encuesta_estudiantil_nativa(p_cuatrimestre_id integer)
 RETURNS TABLE(cuatrimestre_id integer, docente_id integer, asignatura_id integer, grupo_id integer, respuestas_validas bigint, score_normalizado numeric, version_calculo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rol VARCHAR(20);
  v_docente_id INT;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT u.rol, u.entidad_id
    INTO v_rol, v_docente_id
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.activo IS TRUE;

    IF v_rol IS NULL OR v_rol NOT IN ('superadmin', 'coordinador', 'observador', 'docente') THEN
      RAISE EXCEPTION 'authorized role required' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH valid_responses AS (
    SELECT
      g.cuatrimestre_id,
      g.docente_id,
      g.asignatura_id,
      g.id AS grupo_id,
      (
        ((r.calidad_general - 1)::NUMERIC / 5 * 100) +
        ((r.item_plan_estudio - 1)::NUMERIC / 3 * 100) +
        ((r.item_trato_respeto - 1)::NUMERIC / 3 * 100) +
        ((r.item_asistencia - 1)::NUMERIC / 3 * 100) +
        ((r.item_puntualidad - 1)::NUMERIC / 3 * 100) +
        ((r.item_participacion - 1)::NUMERIC / 3 * 100) +
        ((r.item_dominio_materia - 1)::NUMERIC / 3 * 100) +
        ((r.item_plataforma_moodle - 1)::NUMERIC / 3 * 100) +
        ((r.item_pensamiento_critico - 1)::NUMERIC / 3 * 100) +
        ((r.item_desafio_intelectual - 1)::NUMERIC / 3 * 100) +
        ((r.item_claridad_objetivos - 1)::NUMERIC / 3 * 100) +
        ((r.item_lecturas_aprendizaje - 1)::NUMERIC / 3 * 100) +
        ((r.item_respeto_reglas - 1)::NUMERIC / 3 * 100) +
        ((r.item_interes_materia - 1)::NUMERIC / 3 * 100) +
        ((r.item_apoyos_didacticos - 1)::NUMERIC / 3 * 100) +
        ((r.item_actitudes_valores - 1)::NUMERIC / 3 * 100) +
        ((r.item_retroalimentacion - 1)::NUMERIC / 3 * 100) +
        ((r.item_criterios_evaluacion - 1)::NUMERIC / 3 * 100) +
        ((r.item_receptividad - 1)::NUMERIC / 3 * 100)
      ) / 19 AS response_score
    FROM public.encuesta_estudiantil_respuestas r
    JOIN public.grupos g
      ON g.id = r.grupo_id
      AND g.cuatrimestre_id = p_cuatrimestre_id
      AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
      AND r.calidad_general BETWEEN 1 AND 6
      AND r.item_plan_estudio BETWEEN 1 AND 4
      AND r.item_trato_respeto BETWEEN 1 AND 4
      AND r.item_asistencia BETWEEN 1 AND 4
      AND r.item_puntualidad BETWEEN 1 AND 4
      AND r.item_participacion BETWEEN 1 AND 4
      AND r.item_dominio_materia BETWEEN 1 AND 4
      AND r.item_plataforma_moodle BETWEEN 1 AND 4
      AND r.item_pensamiento_critico BETWEEN 1 AND 4
      AND r.item_desafio_intelectual BETWEEN 1 AND 4
      AND r.item_claridad_objetivos BETWEEN 1 AND 4
      AND r.item_lecturas_aprendizaje BETWEEN 1 AND 4
      AND r.item_respeto_reglas BETWEEN 1 AND 4
      AND r.item_interes_materia BETWEEN 1 AND 4
      AND r.item_apoyos_didacticos BETWEEN 1 AND 4
      AND r.item_actitudes_valores BETWEEN 1 AND 4
      AND r.item_retroalimentacion BETWEEN 1 AND 4
      AND r.item_criterios_evaluacion BETWEEN 1 AND 4
      AND r.item_receptividad BETWEEN 1 AND 4
      AND (
        auth.role() = 'service_role'
        OR v_rol = 'superadmin'
        OR (
          v_rol IN ('coordinador', 'observador')
          AND EXISTS (
            SELECT 1
            FROM public.coordinador_docentes cd
            WHERE cd.coordinador_id = auth.uid()
              AND cd.docente_id = g.docente_id
              AND cd.cuatrimestre_id = p_cuatrimestre_id
          )
        )
        OR (v_rol = 'docente' AND g.docente_id = v_docente_id)
      )
  )
  SELECT
    r.cuatrimestre_id,
    r.docente_id,
    r.asignatura_id,
    r.grupo_id,
    COUNT(*)::BIGINT,
    AVG(r.response_score),
    'native-19-v1'::TEXT
  FROM valid_responses r
  GROUP BY r.cuatrimestre_id, r.docente_id, r.asignatura_id, r.grupo_id
  ORDER BY r.docente_id, r.asignatura_id, r.grupo_id;
END;
$function$
;
