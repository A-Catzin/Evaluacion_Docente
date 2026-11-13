-- The student survey joins coordination and observation as an instrument with a per-cycle window.
-- Without a configured window the survey keeps working as before (open); once a window is
-- configured, students can only submit while it is open, and a closed window turns a missing
-- response of a teacher with eligible students into 0 (same rule as the other instruments).
BEGIN;

DO $$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.instrument_submission_windows'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%purpose%'
      AND pg_get_constraintdef(oid) NOT LIKE '%mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.instrument_submission_windows DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.instrument_submission_windows
  ADD CONSTRAINT instrument_submission_windows_purpose_check
  CHECK (purpose IN ('coordination', 'observation', 'student_survey'));

CREATE OR REPLACE FUNCTION public.instrument_submission_window_save(
  p_cuatrimestre_id INTEGER,
  p_purpose TEXT,
  p_mode TEXT,
  p_opens_at TIMESTAMPTZ,
  p_closes_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN
    RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501';
  END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR p_purpose NOT IN ('coordination', 'observation', 'student_survey')
    OR p_mode NOT IN ('manual_open', 'manual_closed', 'scheduled')
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id)
    OR (p_mode = 'scheduled' AND (p_opens_at IS NULL OR p_closes_at IS NULL OR p_opens_at >= p_closes_at))
    OR (p_mode IN ('manual_open', 'manual_closed') AND (p_opens_at IS NOT NULL OR p_closes_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid instrument submission window' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.instrument_submission_windows (
    cuatrimestre_id, purpose, mode, opens_at, closes_at, created_by, updated_by
  ) VALUES (
    p_cuatrimestre_id, p_purpose, p_mode, p_opens_at, p_closes_at, auth.uid(), auth.uid()
  ) ON CONFLICT (cuatrimestre_id, purpose) DO UPDATE
  SET mode = EXCLUDED.mode, opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at,
    updated_by = auth.uid(), updated_at = now();
END;
$function$;

COMMIT;
