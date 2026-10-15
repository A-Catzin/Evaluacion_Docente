-- Forward-only replacement of the deployed native progress body; retains existing function ACL.
-- Fixture and unavailable assignments must not enter any enrollment/control/legacy-response count.
CREATE OR REPLACE FUNCTION "public"."obtener_progreso_encuesta_estudiantil_nativa"("p_cuatrimestre_id" integer) RETURNS TABLE("docente_id" integer, "inscripciones_elegibles" bigint, "controles_enviados" bigint, "respuestas_nativas" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      AND public.cd07_verified_assignment_origin(g.cuatrimestre_id, g.id, g.docente_id, g.asignatura_id) IN ('general-19', 'cd07-real')
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
$$;
