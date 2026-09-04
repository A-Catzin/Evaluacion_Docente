-- Planning corrections require a teacher-visible reason, including versioned captures.

CREATE OR REPLACE FUNCTION public.submit_versioned_instrument(
  p_version_id UUID,
  p_docente_id INTEGER,
  p_cuatrimestre_id INTEGER,
  p_asignatura_id INTEGER,
  p_grupo TEXT,
  p_source_record_id INTEGER,
  p_answers JSONB,
  p_evidence JSONB DEFAULT '[]'::jsonb,
  p_checks JSONB DEFAULT '[]'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_purpose TEXT;
  v_definition_code TEXT;
  v_min NUMERIC;
  v_max NUMERIC;
  v_item_count INTEGER;
  v_na_count INTEGER := 0;
  v_score_sum NUMERIC := 0;
  v_status TEXT;
  v_raw_score NUMERIC;
  v_normalized NUMERIC;
  v_submission_id UUID;
  v_answer JSONB;
  v_item public.instrument_items%ROWTYPE;
  v_value NUMERIC;
  v_reason TEXT;
  v_correction_reason TEXT;
  v_evidence JSONB;
  v_check JSONB;
  v_check_row public.instrument_administrative_checks%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF v_actor IS NULL OR p_version_id IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR jsonb_typeof(p_answers) <> 'array'
    OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_typeof(p_checks) <> 'array'
    OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'invalid instrument submission' USING ERRCODE = '22023';
  END IF;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = v_actor AND COALESCE(u.activo, true);
  SELECT d.purpose, d.code, (v.scale_metadata->>'min')::NUMERIC, (v.scale_metadata->>'max')::NUMERIC
    INTO v_purpose, v_definition_code, v_min, v_max
  FROM public.instrument_versions v JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE v.id = p_version_id AND v.status = 'active' AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now());
  IF v_role IS NULL OR v_purpose IS NULL OR v_min IS NULL OR v_max IS NULL OR v_min > v_max
    OR NOT EXISTS (SELECT 1 FROM public.docentes d WHERE d.id = p_docente_id)
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid instrument submission' USING ERRCODE = '22023';
  END IF;
  IF v_purpose IN ('coordination', 'planning') THEN
    IF v_role NOT IN ('superadmin', 'coordinador') OR NOT public.can_manage_coordinated_teacher(p_docente_id, p_cuatrimestre_id, v_actor) THEN
      RAISE EXCEPTION 'coordinated teacher assignment required' USING ERRCODE = '42501';
    END IF;
  ELSIF v_purpose = 'observation' THEN
    IF v_role NOT IN ('superadmin', 'coordinador', 'observador') OR NOT public.can_observe_assigned_teacher(p_docente_id, p_cuatrimestre_id, v_actor) THEN
      RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_purpose = 'planning' AND (p_source_record_id IS NULL OR p_source_record_id <= 0 OR NOT EXISTS (
    SELECT 1 FROM public.planeaciones p WHERE p.id = p_source_record_id AND p.docente_id = p_docente_id AND p.cuatrimestre_id = p_cuatrimestre_id
  )) THEN RAISE EXCEPTION 'valid planning source required' USING ERRCODE = '22023'; END IF;
  IF v_purpose = 'observation' AND (p_asignatura_id IS NULL OR p_asignatura_id <= 0 OR NULLIF(trim(COALESCE(p_grupo, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'observation subject and group required' USING ERRCODE = '22023';
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
      IF NOT v_item.na_eligible OR v_reason IS NULL THEN RAISE EXCEPTION 'eligible N/A with reason required' USING ERRCODE = '22023'; END IF;
      v_na_count := v_na_count + 1;
    ELSE
      IF jsonb_typeof(v_answer->'value') <> 'number' THEN RAISE EXCEPTION 'numeric score or N/A required' USING ERRCODE = '22023'; END IF;
      v_value := (v_answer->>'value')::NUMERIC;
      IF v_value < v_min OR v_value > v_max OR trunc(v_value) <> v_value OR NULLIF(trim(COALESCE(v_answer->>'na_reason', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'score is outside the instrument scale' USING ERRCODE = '22023';
      END IF;
      v_score_sum := v_score_sum + v_value;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT i.id FROM public.instrument_items i WHERE i.version_id = p_version_id AND i.scored
    EXCEPT SELECT (a->>'item_id')::UUID FROM jsonb_array_elements(p_answers) a
  ) THEN RAISE EXCEPTION 'complete answers required' USING ERRCODE = '22023'; END IF;
  IF v_purpose = 'coordination' AND jsonb_array_length(p_checks) <> 17 THEN RAISE EXCEPTION 'complete administrative checklist required' USING ERRCODE = '22023'; END IF;
  IF v_purpose <> 'coordination' AND jsonb_array_length(p_checks) <> 0 THEN RAISE EXCEPTION 'administrative checks are not allowed for this instrument' USING ERRCODE = '22023'; END IF;
  FOR v_check IN SELECT value FROM jsonb_array_elements(p_checks) LOOP
    SELECT * INTO v_check_row FROM public.instrument_administrative_checks c WHERE c.id = (v_check->>'check_id')::UUID AND c.version_id = p_version_id;
    IF NOT FOUND OR v_check->>'value' NOT IN ('complies', 'does_not_comply', 'na')
      OR (v_check->>'value' = 'na' AND (NOT v_check_row.na_eligible OR NULLIF(trim(COALESCE(v_check->>'na_reason', '')), '') IS NULL))
      OR (v_check->>'value' <> 'na' AND NULLIF(trim(COALESCE(v_check->>'na_reason', '')), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'invalid administrative check' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x->>'check_id') FROM jsonb_array_elements(p_checks) x) <> jsonb_array_length(p_checks) THEN RAISE EXCEPTION 'unique administrative checks required' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_evidence) <> (SELECT count(*) FROM public.instrument_sections s WHERE s.version_id = p_version_id) THEN RAISE EXCEPTION 'evidence for every section required' USING ERRCODE = '22023'; END IF;
  FOR v_evidence IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.instrument_sections s WHERE s.id = (v_evidence->>'section_id')::UUID AND s.version_id = p_version_id)
      OR NULLIF(trim(COALESCE(v_evidence->>'evidence', '')), '') IS NULL THEN RAISE EXCEPTION 'valid evidence for every section required' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x->>'section_id') FROM jsonb_array_elements(p_evidence) x) <> jsonb_array_length(p_evidence) THEN RAISE EXCEPTION 'unique section evidence required' USING ERRCODE = '22023'; END IF;

  v_status := CASE WHEN v_na_count * 100 > v_item_count * 20 THEN 'invalid_excessive_na' ELSE 'valid' END;
  IF v_purpose = 'planning' AND v_status = 'invalid_excessive_na' THEN
    v_correction_reason := NULLIF(trim(COALESCE(p_metadata->>'general_observations', '')), '');
    IF v_correction_reason IS NULL THEN RAISE EXCEPTION 'correction reason required' USING ERRCODE = '22023'; END IF;
  END IF;
  v_raw_score := CASE WHEN v_item_count > v_na_count THEN v_score_sum / (v_item_count - v_na_count) ELSE NULL END;
  v_normalized := CASE WHEN v_status = 'valid' AND v_item_count > v_na_count THEN round((v_score_sum / ((v_item_count - v_na_count) * v_max)) * 100, 2) ELSE NULL END;
  v_snapshot := public.instrument_definition_snapshot(p_version_id);
  INSERT INTO public.instrument_submissions(version_id, purpose, docente_id, cuatrimestre_id, submitted_by, source_record_id, asignatura_id, grupo, validity_status, raw_score, normalized_score, na_count, applicable_item_count, definition_snapshot, metadata)
  VALUES (p_version_id, v_purpose, p_docente_id, p_cuatrimestre_id, v_actor, p_source_record_id, p_asignatura_id, NULLIF(trim(COALESCE(p_grupo, '')), ''), v_status, v_raw_score, v_normalized, v_na_count, v_item_count, v_snapshot, p_metadata)
  RETURNING id INTO v_submission_id;
  INSERT INTO public.instrument_answers(submission_id, cuatrimestre_id, item_id, numeric_value, is_na, na_reason)
  SELECT v_submission_id, p_cuatrimestre_id, (a->>'item_id')::UUID,
    CASE WHEN a->>'value' = 'na' THEN NULL ELSE (a->>'value')::NUMERIC END,
    a->>'value' = 'na', CASE WHEN a->>'value' = 'na' THEN NULLIF(trim(a->>'na_reason'), '') ELSE NULL END
  FROM jsonb_array_elements(p_answers) a;
  INSERT INTO public.instrument_evidence(submission_id, cuatrimestre_id, section_id, evidence)
  SELECT v_submission_id, p_cuatrimestre_id, (e->>'section_id')::UUID, trim(e->>'evidence') FROM jsonb_array_elements(p_evidence) e;
  INSERT INTO public.instrument_administrative_check_answers(submission_id, cuatrimestre_id, check_id, value, na_reason)
  SELECT v_submission_id, p_cuatrimestre_id, (c->>'check_id')::UUID, c->>'value', CASE WHEN c->>'value' = 'na' THEN NULLIF(trim(c->>'na_reason'), '') ELSE NULL END FROM jsonb_array_elements(p_checks) c;
  IF v_purpose = 'planning' THEN
    UPDATE public.planeaciones
    SET estado = CASE WHEN v_status = 'valid' THEN 'Aprobado' ELSE 'Corrección' END,
        puntaje_promedio = v_normalized,
        no_aplica_count = v_na_count,
        comentario_retroalimentacion = CASE WHEN v_status = 'valid' THEN NULL ELSE v_correction_reason END,
        evaluacion_detalle = jsonb_build_object('versioned_submission_id', v_submission_id, 'version_id', p_version_id),
        fecha_evaluacion = now()
    WHERE id = p_source_record_id;
  END IF;
  PERFORM public.audit_write_event(v_actor, v_role, 'instrument.capture', 'instrument.submitted', NULL,
    'instrument_submissions', jsonb_build_object('submission_id', v_submission_id, 'docente_id', p_docente_id, 'cuatrimestre_id', p_cuatrimestre_id),
    'insert', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('purpose', v_purpose, 'version_id', p_version_id, 'validity_status', v_status, 'na_count', v_na_count, 'applicable_item_count', v_item_count));
  RETURN jsonb_build_object('id', v_submission_id, 'validity_status', v_status, 'raw_score', v_raw_score, 'normalized_score', v_normalized, 'na_count', v_na_count, 'applicable_item_count', v_item_count, 'instrument_code', v_definition_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_versioned_instrument(UUID, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_versioned_instrument(UUID, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
