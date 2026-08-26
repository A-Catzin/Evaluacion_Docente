-- 044 corrected the source timestamp column but retained the incompatible
-- physical return types from 041. Keep the established RPC contract explicit.

CREATE OR REPLACE FUNCTION public.audit_completion_summary(p_cuatrimestre_id INTEGER)
RETURNS TABLE (
  docente_id INTEGER,
  docente_nombre TEXT,
  asignatura_id INTEGER,
  asignatura_nombre TEXT,
  grupo_id INTEGER,
  grupo_clave TEXT,
  completed_count BIGINT,
  latest_completed_at TIMESTAMPTZ
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
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    g.docente_id::INTEGER AS docente_id,
    concat_ws(' ', d.nombre, d.apellidos)::TEXT AS docente_nombre,
    g.asignatura_id::INTEGER AS asignatura_id,
    a.nombre::TEXT AS asignatura_nombre,
    g.id::INTEGER AS grupo_id,
    g.clave::TEXT AS grupo_clave,
    COUNT(c.id)::BIGINT AS completed_count,
    MAX(c.fecha_envio)::TIMESTAMPTZ AS latest_completed_at
  FROM public.encuesta_control_envio c
  JOIN public.grupos g ON g.id = c.grupo_id
  JOIN public.docentes d ON d.id = g.docente_id
  JOIN public.asignaturas a ON a.id = g.asignatura_id
  WHERE c.cuatrimestre_id = p_cuatrimestre_id
    AND g.cuatrimestre_id = p_cuatrimestre_id
  GROUP BY g.docente_id, d.nombre, d.apellidos, g.asignatura_id, a.nombre, g.id, g.clave
  ORDER BY MAX(c.fecha_envio) DESC, d.apellidos, d.nombre, a.nombre, g.clave;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_completion_summary(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_completion_summary(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
