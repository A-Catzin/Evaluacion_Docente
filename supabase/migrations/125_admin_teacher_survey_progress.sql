-- Survey progress per teacher and subject group, for the admin page "Avance por docente".
-- Eligibility mirrors obtener_progreso_encuesta_estudiantil_nativa so the per-subject numbers add up to the
-- teacher totals: withdrawn students and disabled surveys only count enrollments already answered.
CREATE OR REPLACE FUNCTION public.admin_avance_encuestas_docentes(p_cuatrimestre_id INTEGER)
RETURNS TABLE(
  docente_id INTEGER,
  docente TEXT,
  docente_activo BOOLEAN,
  grupo_id INTEGER,
  grupo TEXT,
  materia TEXT,
  elegibles INTEGER,
  respondidas INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN
    RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501';
  END IF;
  IF p_cuatrimestre_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT d.id,
    BTRIM(concat_ws(' ', d.nombre, d.apellidos))::TEXT,
    (d.activo IS NOT FALSE),
    g.id,
    COALESCE(NULLIF(BTRIM(g.grupo_normalizado), ''), g.clave)::TEXT,
    a.nombre::TEXT,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE ctl.id IS NOT NULL)::INTEGER
  FROM public.inscripciones i
  JOIN public.grupos g ON g.id = i.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.activo IS TRUE
  JOIN public.docentes d ON d.id = g.docente_id
  JOIN public.asignaturas a ON a.id = g.asignatura_id
  JOIN public.estudiantes es ON es.id = i.estudiante_id
  LEFT JOIN public.encuesta_control_envio ctl
    ON ctl.estudiante_id = i.estudiante_id AND ctl.grupo_id = g.id AND ctl.cuatrimestre_id = p_cuatrimestre_id
  WHERE i.cuatrimestre_id = p_cuatrimestre_id
    AND (ctl.id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.encuesta_estudiantil_exclusiones ex
      WHERE ex.estudiante_id = i.estudiante_id AND ex.grupo_id = g.id AND ex.cuatrimestre_id = p_cuatrimestre_id))
    AND (es.activo IS TRUE OR ctl.id IS NOT NULL)
    AND (g.encuesta_estudiantil_habilitada IS TRUE OR ctl.id IS NOT NULL)
  GROUP BY d.id, d.nombre, d.apellidos, d.activo, g.id, g.grupo_normalizado, g.clave, a.nombre
  -- g.id breaks ties so ranged reads (blocks of 1000) never skip or repeat a group.
  ORDER BY BTRIM(concat_ws(' ', d.nombre, d.apellidos)), d.id, a.nombre, g.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_avance_encuestas_docentes(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_avance_encuestas_docentes(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
