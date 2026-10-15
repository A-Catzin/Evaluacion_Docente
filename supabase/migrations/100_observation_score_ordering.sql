-- Preserve the effective 070 role/teacher scope and six-column return contract;
-- order ties by immutable submission id without changing stored history.
CREATE OR REPLACE FUNCTION public.versioned_instrument_score_rows(p_cuatrimestre_id INTEGER)
RETURNS TABLE(docente_id INTEGER, purpose TEXT, validity_status TEXT, normalized_score NUMERIC, version_id UUID, submitted_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role TEXT;
  v_docente_id INTEGER;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023';
  END IF;

  SELECT u.rol, u.entidad_id
  INTO v_role, v_docente_id
  FROM public.usuarios u
  WHERE u.id = auth.uid()
    AND COALESCE(u.activo, true);

  IF v_role NOT IN ('superadmin', 'coordinador', 'docente')
    AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'performance result access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.docente_id, s.purpose, s.validity_status, s.normalized_score, s.version_id, s.submitted_at
  FROM public.instrument_submissions s
  WHERE s.cuatrimestre_id = p_cuatrimestre_id
    AND (
      auth.role() = 'service_role'
      OR v_role = 'superadmin'
      OR (v_role = 'docente' AND s.docente_id = v_docente_id)
      OR (v_role = 'coordinador' AND public.can_manage_coordinated_teacher(s.docente_id, p_cuatrimestre_id))
    )
  ORDER BY s.submitted_at DESC, s.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.versioned_instrument_score_rows(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.versioned_instrument_score_rows(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
