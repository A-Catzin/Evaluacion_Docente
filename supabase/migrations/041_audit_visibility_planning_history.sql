-- Depends on 040_audit_and_logical_restore_points.sql. Apply 040 first.
-- Adds privacy-safe completion visibility and teacher-owned planning timestamps.

ALTER TABLE public.planeaciones
  ADD COLUMN IF NOT EXISTS first_teacher_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_teacher_submitted_at TIMESTAMPTZ;

UPDATE public.planeaciones
SET first_teacher_submitted_at = COALESCE(first_teacher_submitted_at, fecha_subida),
    latest_teacher_submitted_at = COALESCE(latest_teacher_submitted_at, fecha_subida)
WHERE first_teacher_submitted_at IS NULL
   OR latest_teacher_submitted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_teacher_planning_submission_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT u.rol INTO v_role
  FROM public.usuarios u
  WHERE u.id = auth.uid()
    AND COALESCE(u.activo, true);

  -- Only authenticated teacher writes are submissions. Coordinator reviews must
  -- never alter this history.
  IF v_role = 'docente' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.first_teacher_submitted_at := COALESCE(NEW.first_teacher_submitted_at, now());
    ELSE
      NEW.first_teacher_submitted_at := COALESCE(OLD.first_teacher_submitted_at, OLD.fecha_subida);
    END IF;
    NEW.latest_teacher_submitted_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_teacher_planning_submission_timestamps_trigger ON public.planeaciones;
CREATE TRIGGER set_teacher_planning_submission_timestamps_trigger
BEFORE INSERT OR UPDATE ON public.planeaciones
FOR EACH ROW EXECUTE FUNCTION public.set_teacher_planning_submission_timestamps();

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
    g.docente_id,
    concat_ws(' ', d.nombre, d.apellidos),
    g.asignatura_id,
    a.nombre,
    g.id,
    g.clave,
    count(c.id),
    max(c.created_at)
  FROM public.encuesta_control_envio c
  JOIN public.grupos g ON g.id = c.grupo_id
  JOIN public.docentes d ON d.id = g.docente_id
  JOIN public.asignaturas a ON a.id = g.asignatura_id
  WHERE c.cuatrimestre_id = p_cuatrimestre_id
    AND g.cuatrimestre_id = p_cuatrimestre_id
  GROUP BY g.docente_id, d.nombre, d.apellidos, g.asignatura_id, a.nombre, g.id, g.clave
  ORDER BY max(c.created_at) DESC, d.apellidos, d.nombre, a.nombre, g.clave;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_teacher_planning_submission_timestamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_completion_summary(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_completion_summary(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
