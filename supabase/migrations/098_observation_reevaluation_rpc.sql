-- Only an explicit operation may create a successor; existing initial capture stays unchanged.
CREATE FUNCTION public.reevaluate_observation_instrument(
  p_version_id UUID, p_docente_id INTEGER, p_cuatrimestre_id INTEGER,
  p_asignatura_id INTEGER, p_grupo TEXT, p_supersedes_submission_id UUID,
  p_operation_id UUID, p_answers JSONB, p_evidence JSONB DEFAULT '[]'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_code TEXT;
  v_min NUMERIC;
  v_max NUMERIC;
  v_hash TEXT;
  v_existing public.instrument_submissions%ROWTYPE;
  v_previous public.instrument_submissions%ROWTYPE;
  v_constraint TEXT;
  v_item_count INTEGER;
  v_na_count INTEGER := 0;
  v_score_sum NUMERIC := 0;
  v_value NUMERIC;
  v_reason TEXT;
  v_answer JSONB;
  v_evidence JSONB;
  v_item public.instrument_items%ROWTYPE;
  v_status TEXT;
  v_raw_score NUMERIC;
  v_normalized NUMERIC;
  v_submission_id UUID;
  v_receipt JSONB;
BEGIN
  IF v_actor IS NULL OR p_version_id IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_supersedes_submission_id IS NULL
    OR p_operation_id IS NULL OR p_asignatura_id IS NULL OR p_asignatura_id <= 0
    OR NULLIF(trim(COALESCE(p_grupo, '')), '') IS NULL
    OR jsonb_typeof(p_answers) <> 'array' OR jsonb_typeof(p_evidence) <> 'array'
    OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'invalid observation reevaluation' USING ERRCODE = '22023';
  END IF;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = v_actor AND COALESCE(u.activo, true);
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'coordinador', 'observador')
    OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;

  -- Hash JSONB's canonical textual representation, including the actor and every request field.
  -- Authorization precedes the operation lookup, even when the version is now retired.
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'actor', v_actor, 'version_id', p_version_id, 'docente_id', p_docente_id,
    'cuatrimestre_id', p_cuatrimestre_id, 'asignatura_id', p_asignatura_id,
    'grupo', p_grupo, 'supersedes_submission_id', p_supersedes_submission_id,
    'operation_id', p_operation_id, 'answers', p_answers, 'evidence', p_evidence,
    'metadata', p_metadata)::text, 'UTF8'), 'sha256'), 'hex');
  SELECT s.* INTO v_existing FROM public.instrument_submissions s
  WHERE s.operation_id = p_operation_id AND s.revision_kind = 'revision'
    AND s.submitted_by = v_actor;
  IF FOUND THEN
    IF v_existing.operation_payload_hash IS DISTINCT FROM v_hash
      OR v_existing.docente_id IS DISTINCT FROM p_docente_id
      OR v_existing.cuatrimestre_id IS DISTINCT FROM p_cuatrimestre_id
      OR v_existing.version_id IS DISTINCT FROM p_version_id THEN
      RAISE EXCEPTION 'reevaluation operation payload conflict' USING ERRCODE = '23505', CONSTRAINT = 'instrument_submissions_one_revision_per_operation';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'supersedes_submission_id', v_existing.supersedes_submission_id,
      'validity_status', v_existing.validity_status, 'raw_score', v_existing.raw_score,
      'normalized_score', v_existing.normalized_score, 'na_count', v_existing.na_count,
      'applicable_item_count', v_existing.applicable_item_count,
      'instrument_code', v_existing.definition_snapshot->>'definition_code');
  END IF;

  SELECT d.code, (v.scale_metadata->>'min')::NUMERIC, (v.scale_metadata->>'max')::NUMERIC
    INTO v_code, v_min, v_max
  FROM public.instrument_versions v JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE v.id = p_version_id AND d.purpose = 'observation'
    AND d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
      'observation_simulation', 'observation_teaching_competencies')
    AND v.status = 'active' AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now());
  IF v_code IS NULL OR v_min IS NULL OR v_max IS NULL OR v_min > v_max
    OR NOT EXISTS (SELECT 1 FROM public.docentes d WHERE d.id = p_docente_id)
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid observation reevaluation' USING ERRCODE = '22023';
  END IF;

  -- The trigger locks the predecessor again at insertion; the unique index decides races.
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
    -- Waiting for the predecessor lock may have revealed a committed identical attempt.
    SELECT s.* INTO v_existing FROM public.instrument_submissions s
    WHERE s.operation_id = p_operation_id AND s.revision_kind = 'revision'
      AND s.submitted_by = v_actor;
    IF FOUND AND v_existing.operation_payload_hash = v_hash
      AND v_existing.docente_id = p_docente_id AND v_existing.cuatrimestre_id = p_cuatrimestre_id
      AND v_existing.version_id = p_version_id THEN
      RETURN jsonb_build_object('id', v_existing.id, 'supersedes_submission_id', v_existing.supersedes_submission_id,
        'validity_status', v_existing.validity_status, 'raw_score', v_existing.raw_score,
        'normalized_score', v_existing.normalized_score, 'na_count', v_existing.na_count,
        'applicable_item_count', v_existing.applicable_item_count,
        'instrument_code', v_existing.definition_snapshot->>'definition_code');
    END IF;
    IF FOUND THEN
      RAISE EXCEPTION 'reevaluation operation payload conflict' USING ERRCODE = '23505', CONSTRAINT = 'instrument_submissions_one_revision_per_operation';
    END IF;
    RAISE EXCEPTION 'revision predecessor is no longer current' USING ERRCODE = '23505', CONSTRAINT = 'instrument_submissions_one_revision_per_predecessor';
  END IF;

  SELECT count(*) INTO v_item_count FROM public.instrument_items i WHERE i.version_id = p_version_id AND i.scored;
  IF v_item_count = 0 OR jsonb_array_length(p_answers) <> v_item_count
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE jsonb_typeof(a) <> 'object' OR NULLIF(a->>'item_id', '') IS NULL)
    OR (SELECT count(DISTINCT a->>'item_id') FROM jsonb_array_elements(p_answers) a) <> v_item_count THEN
    RAISE EXCEPTION 'complete unique answers required' USING ERRCODE = '22023';
  END IF;
  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
    SELECT * INTO v_item FROM public.instrument_items i
      WHERE i.id = (v_answer->>'item_id')::UUID AND i.version_id = p_version_id AND i.scored;
    IF NOT FOUND THEN RAISE EXCEPTION 'answer does not belong to this instrument' USING ERRCODE = '22023'; END IF;
    IF v_answer->>'value' = 'na' THEN
      v_reason := NULLIF(trim(COALESCE(v_answer->>'na_reason', '')), '');
      IF NOT v_item.na_eligible OR v_reason IS NULL THEN
        RAISE EXCEPTION 'eligible N/A with reason required' USING ERRCODE = '22023';
      END IF;
      v_na_count := v_na_count + 1;
    ELSE
      IF jsonb_typeof(v_answer->'value') <> 'number' THEN
        RAISE EXCEPTION 'numeric score or N/A required' USING ERRCODE = '22023';
      END IF;
      v_value := (v_answer->>'value')::NUMERIC;
      IF v_value < v_min OR v_value > v_max OR trunc(v_value) <> v_value
        OR NULLIF(trim(COALESCE(v_answer->>'na_reason', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'score is outside the instrument scale' USING ERRCODE = '22023';
      END IF;
      v_score_sum := v_score_sum + v_value;
    END IF;
  END LOOP;
  IF EXISTS (SELECT i.id FROM public.instrument_items i WHERE i.version_id = p_version_id AND i.scored
    EXCEPT SELECT (a->>'item_id')::UUID FROM jsonb_array_elements(p_answers) a) THEN
    RAISE EXCEPTION 'complete answers required' USING ERRCODE = '22023';
  END IF;
  -- Observation has no administrative checklist input: the implicit checklist is [].
  IF jsonb_array_length(p_evidence) <> (SELECT count(*) FROM public.instrument_sections s WHERE s.version_id = p_version_id) THEN
    RAISE EXCEPTION 'evidence for every section required' USING ERRCODE = '22023';
  END IF;
  FOR v_evidence IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.instrument_sections s
      WHERE s.id = (v_evidence->>'section_id')::UUID AND s.version_id = p_version_id)
      OR NULLIF(trim(COALESCE(v_evidence->>'evidence', '')), '') IS NULL THEN
      RAISE EXCEPTION 'valid evidence for every section required' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x->>'section_id') FROM jsonb_array_elements(p_evidence) x) <> jsonb_array_length(p_evidence) THEN
    RAISE EXCEPTION 'unique section evidence required' USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN v_na_count * 100 > v_item_count * 20 THEN 'invalid_excessive_na' ELSE 'valid' END;
  v_raw_score := CASE WHEN v_item_count > v_na_count THEN v_score_sum / (v_item_count - v_na_count) ELSE NULL END;
  v_normalized := CASE WHEN v_status = 'valid' AND v_item_count > v_na_count
    THEN round((v_score_sum / ((v_item_count - v_na_count) * v_max)) * 100, 2) ELSE NULL END;
  -- Catch only the two named concurrency conflicts; the subtransaction rolls back
  -- inserts (and any audit writes) before the retry lookup in the outer block.
  BEGIN
    INSERT INTO public.instrument_submissions(
      version_id, purpose, docente_id, cuatrimestre_id, submitted_by, asignatura_id, grupo,
      validity_status, raw_score, normalized_score, na_count, applicable_item_count,
      definition_snapshot, metadata, revision_kind, supersedes_submission_id, operation_id, operation_payload_hash
    ) VALUES (
      p_version_id, 'observation', p_docente_id, p_cuatrimestre_id, v_actor, p_asignatura_id,
      NULLIF(trim(COALESCE(p_grupo, '')), ''), v_status, v_raw_score, v_normalized,
      v_na_count, v_item_count, public.instrument_definition_snapshot(p_version_id), p_metadata,
      'revision', p_supersedes_submission_id, p_operation_id, v_hash
    ) RETURNING id INTO v_submission_id;
    INSERT INTO public.instrument_answers(submission_id, cuatrimestre_id, item_id, numeric_value, is_na, na_reason)
    SELECT v_submission_id, p_cuatrimestre_id, (a->>'item_id')::UUID,
      CASE WHEN a->>'value' = 'na' THEN NULL ELSE (a->>'value')::NUMERIC END,
      a->>'value' = 'na', CASE WHEN a->>'value' = 'na' THEN NULLIF(trim(a->>'na_reason'), '') ELSE NULL END
    FROM jsonb_array_elements(p_answers) a;
    INSERT INTO public.instrument_evidence(submission_id, cuatrimestre_id, section_id, evidence)
    SELECT v_submission_id, p_cuatrimestre_id, (e->>'section_id')::UUID, trim(e->>'evidence')
    FROM jsonb_array_elements(p_evidence) e;
    PERFORM public.audit_write_event(v_actor, v_role, 'instrument.capture', 'instrument.reevaluation', NULL,
      'instrument_submissions', jsonb_build_object('submission_id', v_submission_id,
        'docente_id', p_docente_id, 'cuatrimestre_id', p_cuatrimestre_id),
      'insert', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
      jsonb_build_object('purpose', 'observation', 'version_id', p_version_id,
        'supersedes_submission_id', p_supersedes_submission_id, 'operation_id', p_operation_id,
        'validity_status', v_status, 'na_count', v_na_count, 'applicable_item_count', v_item_count));
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'instrument_submissions_one_revision_per_operation' THEN
      SELECT s.* INTO v_existing FROM public.instrument_submissions s
      WHERE s.operation_id = p_operation_id AND s.revision_kind = 'revision'
        AND s.submitted_by = v_actor;
      IF FOUND AND v_existing.operation_payload_hash = v_hash
        AND v_existing.docente_id = p_docente_id AND v_existing.cuatrimestre_id = p_cuatrimestre_id
        AND v_existing.version_id = p_version_id THEN
        RETURN jsonb_build_object('id', v_existing.id, 'supersedes_submission_id', v_existing.supersedes_submission_id,
          'validity_status', v_existing.validity_status, 'raw_score', v_existing.raw_score,
          'normalized_score', v_existing.normalized_score, 'na_count', v_existing.na_count,
          'applicable_item_count', v_existing.applicable_item_count,
          'instrument_code', v_existing.definition_snapshot->>'definition_code');
      END IF;
      RAISE EXCEPTION 'reevaluation operation conflict' USING ERRCODE = '23505', CONSTRAINT = 'instrument_submissions_one_revision_per_operation';
    ELSIF v_constraint = 'instrument_submissions_one_revision_per_predecessor' THEN
      -- A concurrent retry may hit the predecessor index before the operation index.
      SELECT s.* INTO v_existing FROM public.instrument_submissions s
      WHERE s.operation_id = p_operation_id AND s.revision_kind = 'revision'
        AND s.submitted_by = v_actor;
      IF FOUND AND v_existing.operation_payload_hash = v_hash
        AND v_existing.docente_id = p_docente_id AND v_existing.cuatrimestre_id = p_cuatrimestre_id
        AND v_existing.version_id = p_version_id THEN
        RETURN jsonb_build_object('id', v_existing.id, 'supersedes_submission_id', v_existing.supersedes_submission_id,
          'validity_status', v_existing.validity_status, 'raw_score', v_existing.raw_score,
          'normalized_score', v_existing.normalized_score, 'na_count', v_existing.na_count,
          'applicable_item_count', v_existing.applicable_item_count,
          'instrument_code', v_existing.definition_snapshot->>'definition_code');
      END IF;
      RAISE EXCEPTION 'revision predecessor is no longer current' USING ERRCODE = '23505', CONSTRAINT = 'instrument_submissions_one_revision_per_predecessor';
    ELSE
      RAISE;
    END IF;
  END;
  RETURN jsonb_build_object('id', v_submission_id, 'supersedes_submission_id', p_supersedes_submission_id,
    'validity_status', v_status, 'raw_score', v_raw_score, 'normalized_score', v_normalized,
    'na_count', v_na_count, 'applicable_item_count', v_item_count, 'instrument_code', v_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.reevaluate_observation_instrument(UUID, INTEGER, INTEGER, INTEGER, TEXT, UUID, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reevaluate_observation_instrument(UUID, INTEGER, INTEGER, INTEGER, TEXT, UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- The initial retry lookup must not find both the initial and its revisions.
CREATE OR REPLACE FUNCTION public.get_own_observation_instrument_submission(
  p_docente_id INTEGER,
  p_cuatrimestre_id INTEGER,
  p_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'valid observation submission request required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_actor AND COALESCE(u.activo, true)
      AND u.rol IN ('superadmin', 'coordinador', 'observador')
  ) OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', s.id,
    'validity_status', s.validity_status,
    'raw_score', s.raw_score,
    'normalized_score', s.normalized_score,
    'na_count', s.na_count,
    'applicable_item_count', s.applicable_item_count,
    'instrument_code', s.definition_snapshot->>'definition_code'
  ) INTO v_result
  FROM public.instrument_submissions s
  WHERE s.submitted_by = v_actor
    AND s.docente_id = p_docente_id
    AND s.cuatrimestre_id = p_cuatrimestre_id
    AND s.version_id = p_version_id
    AND s.purpose = 'observation'
    AND s.revision_kind = 'initial';

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_own_observation_instrument_submission(INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_observation_instrument_submission(INTEGER, INTEGER, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
