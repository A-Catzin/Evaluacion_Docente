-- The assignment trigger serves tables with different row types. Access actor IDs
-- through JSON so a coordinated row never resolves observation-only evaluator_id
-- (and vice versa) while the shared trigger function is compiled and executed.
CREATE OR REPLACE FUNCTION public.validate_teacher_assignment_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_previous_actor_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'coordinated_teacher_assignments' THEN
    v_actor_id := (to_jsonb(NEW) ->> 'coordinador_id')::UUID;
    IF TG_OP = 'UPDATE' THEN
      v_previous_actor_id := (to_jsonb(OLD) ->> 'coordinador_id')::UUID;
    END IF;
    IF NOT public.is_active_coordinator(v_actor_id) THEN
      RAISE EXCEPTION 'active resolved actor with an allowed role required' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'observation_teacher_assignments' THEN
    v_actor_id := (to_jsonb(NEW) ->> 'evaluator_id')::UUID;
    IF TG_OP = 'UPDATE' THEN
      v_previous_actor_id := (to_jsonb(OLD) ->> 'evaluator_id')::UUID;
    END IF;
    IF NOT public.is_active_observation_evaluator(v_actor_id) THEN
      RAISE EXCEPTION 'active resolved actor with an allowed role required' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported teacher assignment table' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.docentes d WHERE d.id = NEW.docente_id) THEN
    RAISE EXCEPTION 'teacher required' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.docente_id IS DISTINCT FROM OLD.docente_id
    OR NEW.cuatrimestre_id IS DISTINCT FROM OLD.cuatrimestre_id
    OR v_actor_id IS DISTINCT FROM v_previous_actor_id
    OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
    OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
    OR NEW.source IS DISTINCT FROM OLD.source
  ) THEN
    RAISE EXCEPTION 'assignment identity is immutable' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_teacher_assignment_actor() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_coordinated_teacher_assignment_actor
  ON public.coordinated_teacher_assignments;
CREATE TRIGGER validate_coordinated_teacher_assignment_actor
BEFORE INSERT OR UPDATE ON public.coordinated_teacher_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_teacher_assignment_actor();

DROP TRIGGER IF EXISTS validate_observation_teacher_assignment_actor
  ON public.observation_teacher_assignments;
CREATE TRIGGER validate_observation_teacher_assignment_actor
BEFORE INSERT OR UPDATE ON public.observation_teacher_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_teacher_assignment_actor();

NOTIFY pgrst, 'reload schema';
