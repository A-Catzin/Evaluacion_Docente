-- Schema prerequisite only: revisions remain unreachable through the existing submit RPC.
-- Existing finals and their answers are never rewritten.
ALTER TABLE public.instrument_submissions
  ADD COLUMN revision_kind TEXT NOT NULL DEFAULT 'initial',
  ADD COLUMN supersedes_submission_id UUID REFERENCES public.instrument_submissions(id),
  ADD COLUMN operation_id UUID,
  ADD COLUMN operation_payload_hash TEXT,
  ADD CONSTRAINT instrument_submissions_revision_tuple_check CHECK (
    (revision_kind = 'initial' AND supersedes_submission_id IS NULL AND operation_id IS NULL AND operation_payload_hash IS NULL)
    OR (revision_kind = 'revision' AND purpose = 'observation' AND supersedes_submission_id IS NOT NULL AND operation_id IS NOT NULL
      AND operation_payload_hash IS NOT NULL AND operation_payload_hash ~ '^[0-9a-f]{64}$'
      AND supersedes_submission_id <> id)
  );

-- Keep the old name and key: existing 23505 retry recovery identifies initial captures.
DROP INDEX public.instrument_submissions_one_observation_capture;
CREATE UNIQUE INDEX instrument_submissions_one_observation_capture
  ON public.instrument_submissions(docente_id, cuatrimestre_id, purpose, version_id)
  WHERE purpose = 'observation' AND revision_kind = 'initial';
CREATE UNIQUE INDEX instrument_submissions_one_revision_per_predecessor
  ON public.instrument_submissions(supersedes_submission_id) WHERE revision_kind = 'revision';
CREATE UNIQUE INDEX instrument_submissions_one_revision_per_operation
  ON public.instrument_submissions(operation_id) WHERE revision_kind = 'revision';

CREATE FUNCTION public.guard_new_observation_revision()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_predecessor public.instrument_submissions%ROWTYPE;
BEGIN
  IF NEW.revision_kind <> 'revision' THEN RETURN NEW; END IF;
  IF NEW.submitted_by <> auth.uid() OR auth.uid() IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND COALESCE(u.activo, true)
        AND u.rol IN ('superadmin', 'coordinador', 'observador')
    ) OR NOT public.can_observe_assigned_teacher(NEW.docente_id, NEW.cuatrimestre_id, auth.uid()) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instrument_versions v
    JOIN public.instrument_definitions d ON d.id = v.definition_id
    WHERE v.id = NEW.version_id AND d.purpose = 'observation'
      AND d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
        'observation_simulation', 'observation_teaching_competencies')
        AND v.status = 'active' AND v.effective_from <= now()
        AND (v.effective_to IS NULL OR v.effective_to > now())
  ) THEN
    RAISE EXCEPTION 'revision instrument not allowed' USING ERRCODE = '22023';
  END IF;
  -- Lock the predecessor before checking its successor. The unique index is the
  -- final defense against forks, including concurrent transactions.
  SELECT p.* INTO v_predecessor FROM public.instrument_submissions p
  WHERE p.id = NEW.supersedes_submission_id FOR UPDATE;
  IF NOT FOUND OR v_predecessor.docente_id IS DISTINCT FROM NEW.docente_id
    OR v_predecessor.cuatrimestre_id IS DISTINCT FROM NEW.cuatrimestre_id
    OR v_predecessor.version_id IS DISTINCT FROM NEW.version_id
    OR v_predecessor.purpose IS DISTINCT FROM NEW.purpose THEN
    RAISE EXCEPTION 'revision predecessor mismatch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.instrument_submissions s
    JOIN public.instrument_submissions p ON p.id = NEW.supersedes_submission_id
    WHERE s.supersedes_submission_id = p.id
  ) THEN
    RAISE EXCEPTION 'revision predecessor is no longer current' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER instrument_submissions_revision_guard_trigger
  BEFORE INSERT ON public.instrument_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_observation_revision();
REVOKE ALL ON FUNCTION public.guard_new_observation_revision() FROM PUBLIC, anon, authenticated, service_role;
