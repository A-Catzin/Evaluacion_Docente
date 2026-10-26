-- Grade calculations run under many sessions (admin, coordinator, student, service role) and none of
-- them may read the window table. This exposes only one boolean: has the cycle's
-- self-assessment window been configured and then closed (manually or by its scheduled end)?
CREATE OR REPLACE FUNCTION public.autodiagnostico_cycle_window_closed(p_cuatrimestre_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    public.autodiagnostico_submission_window_effective_state(p_cuatrimestre_id) IN ('closed', 'scheduled_ended'),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.autodiagnostico_cycle_window_closed(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.autodiagnostico_cycle_window_closed(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
