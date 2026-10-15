-- Reuse 090's cycle-scoped draft row and its actor/target/version uniqueness.
ALTER TABLE public.instrument_submission_drafts
  ADD COLUMN operation_id UUID,
  ADD COLUMN supersedes_submission_id UUID REFERENCES public.instrument_submissions(id),
  ADD CONSTRAINT instrument_submission_drafts_revision_pair_check CHECK (
    (operation_id IS NULL AND supersedes_submission_id IS NULL)
    OR (operation_id IS NOT NULL AND supersedes_submission_id IS NOT NULL)
  );
CREATE UNIQUE INDEX instrument_submission_drafts_operation_unique
  ON public.instrument_submission_drafts(operation_id) WHERE operation_id IS NOT NULL;

CREATE FUNCTION public.get_observation_revision_state(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_head public.instrument_submissions%ROWTYPE;
  v_draft JSONB;
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'valid observation revision request required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_actor
      AND COALESCE(u.activo, true) AND u.rol IN ('superadmin', 'coordinador', 'observador'))
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor)
    OR NOT EXISTS (SELECT 1 FROM public.instrument_versions v
      JOIN public.instrument_definitions definition ON definition.id = v.definition_id
      WHERE v.id = p_version_id AND definition.purpose = 'observation'
        AND definition.code IN ('observation_supervision_clinical', 'observation_professional_practice',
          'observation_simulation', 'observation_teaching_competencies')) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_head FROM public.instrument_submissions s
  WHERE s.docente_id = p_docente_id AND s.cuatrimestre_id = p_cuatrimestre_id
    AND s.version_id = p_version_id AND s.purpose = 'observation'
    AND NOT EXISTS (SELECT 1 FROM public.instrument_submissions successor
      WHERE successor.supersedes_submission_id = s.id AND successor.revision_kind = 'revision');
  IF v_head.id IS NOT NULL THEN
    SELECT jsonb_build_object('operation_id', d.operation_id, 'supersedes_submission_id', d.supersedes_submission_id,
      'draft', d.draft, 'updated_at', d.updated_at) INTO v_draft
    FROM public.instrument_submission_drafts d
    WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
      AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id
      AND d.supersedes_submission_id = v_head.id;
  END IF;
  RETURN jsonb_build_object('head', CASE WHEN v_head.id IS NULL THEN NULL ELSE
    jsonb_build_object('id', v_head.id, 'validity_status', v_head.validity_status,
      'submitted_at', v_head.submitted_at) END, 'revision_draft', v_draft);
END;
$function$;

CREATE FUNCTION public.save_observation_revision_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID,
  p_supersedes_submission_id UUID, p_operation_id UUID, p_draft JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_previous public.instrument_submissions%ROWTYPE;
  v_existing public.instrument_submission_drafts%ROWTYPE;
  v_result JSONB;
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL
    OR p_supersedes_submission_id IS NULL OR p_operation_id IS NULL
    OR p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object'
    OR octet_length(p_draft::TEXT) > 100000 THEN
    RAISE EXCEPTION 'valid observation revision draft required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_actor
      AND COALESCE(u.activo, true) AND u.rol IN ('superadmin', 'coordinador', 'observador'))
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  -- Never return another actor's operation receipt or reveal its target.
  SELECT s.* INTO v_previous FROM public.instrument_submissions s
  WHERE s.operation_id = p_operation_id AND s.submitted_by = v_actor AND s.revision_kind = 'revision';
  IF FOUND THEN
    IF v_previous.docente_id = p_docente_id AND v_previous.cuatrimestre_id = p_cuatrimestre_id
      AND v_previous.version_id = p_version_id AND v_previous.supersedes_submission_id = p_supersedes_submission_id THEN
      RETURN jsonb_build_object('completed', true);
    END IF;
    RAISE EXCEPTION 'revision draft operation conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instrument_submissions s
    WHERE s.operation_id = p_operation_id AND s.revision_kind = 'revision') THEN
    RAISE EXCEPTION 'revision draft operation conflict' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.instrument_versions v
    JOIN public.instrument_definitions definition ON definition.id = v.definition_id
    WHERE v.id = p_version_id AND definition.purpose = 'observation'
      AND definition.code IN ('observation_supervision_clinical', 'observation_professional_practice',
        'observation_simulation', 'observation_teaching_competencies')
      AND v.status = 'active' AND v.effective_from <= now()
      AND (v.effective_to IS NULL OR v.effective_to > now())) THEN
    RAISE EXCEPTION 'revision instrument not allowed' USING ERRCODE = '22023';
  END IF;
  -- Same predecessor row lock as 097/098's commit path.
  SELECT s.* INTO v_previous FROM public.instrument_submissions s
  WHERE s.id = p_supersedes_submission_id FOR UPDATE;
  IF NOT FOUND OR v_previous.docente_id IS DISTINCT FROM p_docente_id
    OR v_previous.cuatrimestre_id IS DISTINCT FROM p_cuatrimestre_id
    OR v_previous.version_id IS DISTINCT FROM p_version_id
    OR v_previous.purpose IS DISTINCT FROM 'observation' THEN
    RAISE EXCEPTION 'revision predecessor mismatch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instrument_submissions s
    WHERE s.supersedes_submission_id = p_supersedes_submission_id AND s.revision_kind = 'revision') THEN
    IF EXISTS (SELECT 1 FROM public.instrument_submissions s
      WHERE s.operation_id = p_operation_id AND s.submitted_by = v_actor
        AND s.revision_kind = 'revision' AND s.docente_id = p_docente_id
        AND s.cuatrimestre_id = p_cuatrimestre_id AND s.version_id = p_version_id
        AND s.supersedes_submission_id = p_supersedes_submission_id) THEN
      RETURN jsonb_build_object('completed', true);
    END IF;
    RAISE EXCEPTION 'revision predecessor is no longer current' USING ERRCODE = '23505';
  END IF;
  SELECT d.* INTO v_existing FROM public.instrument_submission_drafts d
  WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
    AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id FOR UPDATE;
  IF FOUND AND v_existing.operation_id IS NULL THEN
    RAISE EXCEPTION 'initial draft still active' USING ERRCODE = '23505';
  END IF;
  IF FOUND AND ((v_existing.supersedes_submission_id = p_supersedes_submission_id
      AND v_existing.operation_id IS DISTINCT FROM p_operation_id)
    OR (v_existing.operation_id = p_operation_id
      AND v_existing.supersedes_submission_id IS DISTINCT FROM p_supersedes_submission_id)) THEN
    RAISE EXCEPTION 'revision draft operation conflict' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instrument_submission_drafts d
    WHERE d.operation_id = p_operation_id AND (d.submitted_by IS DISTINCT FROM v_actor
      OR d.docente_id IS DISTINCT FROM p_docente_id OR d.cuatrimestre_id IS DISTINCT FROM p_cuatrimestre_id
      OR d.version_id IS DISTINCT FROM p_version_id OR d.supersedes_submission_id IS DISTINCT FROM p_supersedes_submission_id)) THEN
    RAISE EXCEPTION 'revision draft operation conflict' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.instrument_submission_drafts AS d
    (submitted_by, docente_id, cuatrimestre_id, version_id, operation_id, supersedes_submission_id, draft, updated_at)
  VALUES (v_actor, p_docente_id, p_cuatrimestre_id, p_version_id, p_operation_id, p_supersedes_submission_id, p_draft, now())
  ON CONFLICT (submitted_by, docente_id, cuatrimestre_id, version_id) DO UPDATE
    SET operation_id = EXCLUDED.operation_id, supersedes_submission_id = EXCLUDED.supersedes_submission_id,
      draft = EXCLUDED.draft, updated_at = now()
    WHERE (d.operation_id = EXCLUDED.operation_id AND d.supersedes_submission_id = EXCLUDED.supersedes_submission_id)
      OR (d.operation_id IS NOT NULL AND d.operation_id <> EXCLUDED.operation_id
        AND d.supersedes_submission_id <> EXCLUDED.supersedes_submission_id)
  RETURNING jsonb_build_object('operation_id', d.operation_id, 'supersedes_submission_id', d.supersedes_submission_id,
    'draft', d.draft, 'updated_at', d.updated_at) INTO v_result;
  IF v_result IS NULL THEN RAISE EXCEPTION 'revision draft operation conflict' USING ERRCODE = '23505'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.delete_observation_revision_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID,
  p_supersedes_submission_id UUID, p_operation_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL
    OR p_supersedes_submission_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'valid observation revision draft request required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_actor
      AND COALESCE(u.activo, true) AND u.rol IN ('superadmin', 'coordinador', 'observador'))
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor)
    OR NOT EXISTS (SELECT 1 FROM public.instrument_versions v
      JOIN public.instrument_definitions definition ON definition.id = v.definition_id
      WHERE v.id = p_version_id AND definition.purpose = 'observation'
        AND definition.code IN ('observation_supervision_clinical', 'observation_professional_practice',
          'observation_simulation', 'observation_teaching_competencies')) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.instrument_submission_drafts d
  WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
    AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id
    AND d.operation_id = p_operation_id AND d.supersedes_submission_id = p_supersedes_submission_id;
END;
$function$;

-- 091's initial autosave stays benign after completion but cannot delete or
-- overwrite an actor's revision draft. The submission trigger remains unchanged.
CREATE OR REPLACE FUNCTION public.save_observation_instrument_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID, p_draft JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor UUID := auth.uid(); v_result JSONB;
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL
    OR p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object'
    OR octet_length(p_draft::TEXT) > 100000 THEN
    RAISE EXCEPTION 'valid observation draft required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_actor AND COALESCE(u.activo, true)
      AND u.rol IN ('superadmin', 'coordinador', 'observador'))
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor)
    OR NOT EXISTS (SELECT 1 FROM public.instrument_versions v
      JOIN public.instrument_definitions definition ON definition.id = v.definition_id
      WHERE v.id = p_version_id AND definition.purpose = 'observation') THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instrument_submissions s
    WHERE s.docente_id = p_docente_id AND s.cuatrimestre_id = p_cuatrimestre_id
      AND s.version_id = p_version_id AND s.purpose = 'observation') THEN
    DELETE FROM public.instrument_submission_drafts d
    WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
      AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id
      AND d.operation_id IS NULL;
    RETURN jsonb_build_object('completed', true);
  END IF;
  INSERT INTO public.instrument_submission_drafts AS d
    (submitted_by, docente_id, cuatrimestre_id, version_id, draft, updated_at)
  VALUES (v_actor, p_docente_id, p_cuatrimestre_id, p_version_id, p_draft, now())
  ON CONFLICT (submitted_by, docente_id, cuatrimestre_id, version_id) DO UPDATE
    SET draft = EXCLUDED.draft, updated_at = now() WHERE d.operation_id IS NULL
  RETURNING jsonb_build_object('draft', d.draft, 'updated_at', d.updated_at) INTO v_result;
  IF EXISTS (SELECT 1 FROM public.instrument_submissions s
    WHERE s.docente_id = p_docente_id AND s.cuatrimestre_id = p_cuatrimestre_id
      AND s.version_id = p_version_id AND s.purpose = 'observation') THEN
    DELETE FROM public.instrument_submission_drafts d
    WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
      AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id
      AND d.operation_id IS NULL;
    RETURN jsonb_build_object('completed', true);
  END IF;
  -- An in-flight initial autosave must never replace an explicit revision draft.
  IF v_result IS NULL THEN RETURN jsonb_build_object('completed', true); END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_observation_instrument_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'valid observation draft request required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_actor AND COALESCE(u.activo, true)
      AND u.rol IN ('superadmin', 'coordinador', 'observador'))
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor)
    OR NOT EXISTS (SELECT 1 FROM public.instrument_versions v
      JOIN public.instrument_definitions definition ON definition.id = v.definition_id
      WHERE v.id = p_version_id AND definition.purpose = 'observation') THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.instrument_submission_drafts d
  WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
    AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id
    AND d.operation_id IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_observation_revision_state(INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_observation_revision_draft(INTEGER, INTEGER, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_observation_revision_draft(INTEGER, INTEGER, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_observation_revision_state(INTEGER, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_observation_revision_draft(INTEGER, INTEGER, UUID, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_observation_revision_draft(INTEGER, INTEGER, UUID, UUID, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
