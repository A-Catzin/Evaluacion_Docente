-- Internal classification only; no student authorization or scoring integration.
-- Deployment owner must own this SECURITY DEFINER function and both private registries.
CREATE FUNCTION public.cd07_verified_assignment_origin(p_cuatrimestre_id integer, p_grupo_id integer, p_docente_id integer, p_asignatura_id integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_real public.student_cd07_real_assignment_manifest%ROWTYPE;
  v_fixture public.student_cd07_fixture_authorization%ROWTYPE;
  v_real_found boolean := false;
  v_fixture_found boolean := false;
  v_real_active boolean := false;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR p_grupo_id IS NULL OR p_grupo_id <= 0
    OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_asignatura_id IS NULL OR p_asignatura_id <= 0 THEN
    RAISE EXCEPTION 'Invalid assignment identity';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grupos g
    JOIN public.cuatrimestres c ON c.id = g.cuatrimestre_id
    WHERE g.id = p_grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id
      AND g.docente_id = p_docente_id AND g.asignatura_id = p_asignatura_id
      AND g.activo IS TRUE AND c.activo IS TRUE
      AND COALESCE(c.cerrado, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'Assignment is not current and open';
  END IF;

  SELECT * INTO v_real FROM public.student_cd07_real_assignment_manifest
    WHERE cuatrimestre_id = p_cuatrimestre_id AND grupo_id = p_grupo_id;
  v_real_found := FOUND;
  SELECT * INTO v_fixture FROM public.student_cd07_fixture_authorization
    WHERE cuatrimestre_id = p_cuatrimestre_id AND grupo_id = p_grupo_id;
  v_fixture_found := FOUND;

  IF v_real_found THEN
    IF v_real.docente_id IS DISTINCT FROM p_docente_id
      OR v_real.asignatura_id IS DISTINCT FROM p_asignatura_id
      OR v_real.instrument_code IS DISTINCT FROM 'SED-360-INST-EST-CD-07-V1.1'
      OR v_real.assignment_revision IS NULL
      OR char_length(v_real.assignment_revision) NOT BETWEEN 1 AND 120
      OR btrim(v_real.assignment_revision) = '' THEN
      RAISE EXCEPTION 'Invalid real assignment registration';
    END IF;
    v_real_active := v_real.is_active;
  END IF;
  IF v_fixture_found THEN
    IF v_fixture.docente_id IS DISTINCT FROM p_docente_id
      OR v_fixture.asignatura_id IS DISTINCT FROM p_asignatura_id
      OR v_fixture.instrument_code IS DISTINCT FROM 'SED-360-INST-EST-CD-07-V1.1'
      OR v_fixture.assignment_revision IS NULL
      OR char_length(v_fixture.assignment_revision) NOT BETWEEN 1 AND 120
      OR btrim(v_fixture.assignment_revision) = '' THEN
      RAISE EXCEPTION 'Invalid fixture assignment registration';
    END IF;
  END IF;
  IF v_real_found AND v_fixture_found THEN
    RAISE EXCEPTION 'Ambiguous assignment registration';
  END IF;
  IF v_fixture_found THEN
    RETURN 'fixture';
  END IF;
  IF v_real_found THEN
    IF v_real_active THEN
      RETURN 'cd07-real';
    END IF;
    RETURN 'unavailable';
  END IF;
  RETURN 'general-19';
END;
$$;

REVOKE ALL ON FUNCTION public.cd07_verified_assignment_origin(integer, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
