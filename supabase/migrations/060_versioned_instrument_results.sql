-- Valid versioned captures supersede only the corresponding current-cycle
-- legacy input. Historical rows remain readable and retain their old scores.

ALTER TABLE public.calificaciones_finales
  ADD COLUMN IF NOT EXISTS instrument_validity JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_invalid_instrument BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.versioned_instrument_score_rows(p_cuatrimestre_id INTEGER)
RETURNS TABLE(docente_id INTEGER, purpose TEXT, validity_status TEXT, normalized_score NUMERIC, version_id UUID, submitted_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role TEXT;
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023';
  END IF;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
  IF v_role NOT IN ('superadmin', 'coordinador') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'performance result access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.docente_id, s.purpose, s.validity_status, s.normalized_score, s.version_id, s.submitted_at
  FROM public.instrument_submissions s
  WHERE s.cuatrimestre_id = p_cuatrimestre_id
    AND (auth.role() = 'service_role' OR v_role = 'superadmin' OR public.can_manage_coordinated_teacher(s.docente_id, p_cuatrimestre_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_versioned_instrument_submission_detail(p_submission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_submission public.instrument_submissions%ROWTYPE; v_role TEXT;
BEGIN
  IF p_submission_id IS NULL THEN RAISE EXCEPTION 'submission id required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_submission FROM public.instrument_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'instrument submission not found' USING ERRCODE = 'P0002'; END IF;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
  IF v_role <> 'superadmin' AND (v_role <> 'coordinador' OR NOT public.can_manage_coordinated_teacher(v_submission.docente_id, v_submission.cuatrimestre_id)) THEN
    RAISE EXCEPTION 'coordinated performance access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('submission', to_jsonb(v_submission), 'answers', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.instrument_answers a WHERE a.submission_id = p_submission_id), '[]'::jsonb), 'evidence', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.instrument_evidence e WHERE e.submission_id = p_submission_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_calificacion_final(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_result JSONB;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR NULLIF(p_payload->>'docente_id', '') IS NULL OR NULLIF(p_payload->>'cuatrimestre_id', '') IS NULL THEN
    RAISE EXCEPTION 'valid final score payload required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.calificaciones_finales (
    docente_id, cuatrimestre_id, modalidad_snapshot, score_encuesta_estudiantil,
    score_coordinacion, score_planeacion, score_observacion, score_autoevaluacion,
    calificacion_final, categoria_final, num_instrumentos_completados,
    num_instrumentos_esperados, version_calculo, calculada_en, instrument_validity, has_invalid_instrument
  ) VALUES (
    (p_payload->>'docente_id')::INTEGER, (p_payload->>'cuatrimestre_id')::INTEGER,
    p_payload->>'modalidad_snapshot', NULLIF(p_payload->>'score_encuesta_estudiantil', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_coordinacion', '')::NUMERIC(5,2), NULLIF(p_payload->>'score_planeacion', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_observacion', '')::NUMERIC(5,2), NULLIF(p_payload->>'score_autoevaluacion', '')::NUMERIC(5,2),
    (p_payload->>'calificacion_final')::NUMERIC(5,2), p_payload->>'categoria_final',
    (p_payload->>'num_instrumentos_completados')::INTEGER, (p_payload->>'num_instrumentos_esperados')::INTEGER,
    p_payload->>'version_calculo', COALESCE((p_payload->>'calculada_en')::TIMESTAMPTZ, now()),
    COALESCE(p_payload->'instrument_validity', '{}'::jsonb), COALESCE((p_payload->>'has_invalid_instrument')::BOOLEAN, false)
  ) ON CONFLICT (docente_id, cuatrimestre_id) DO UPDATE SET
    modalidad_snapshot = EXCLUDED.modalidad_snapshot, score_encuesta_estudiantil = EXCLUDED.score_encuesta_estudiantil,
    score_coordinacion = EXCLUDED.score_coordinacion, score_planeacion = EXCLUDED.score_planeacion,
    score_observacion = EXCLUDED.score_observacion, score_autoevaluacion = EXCLUDED.score_autoevaluacion,
    calificacion_final = EXCLUDED.calificacion_final, categoria_final = EXCLUDED.categoria_final,
    num_instrumentos_completados = EXCLUDED.num_instrumentos_completados,
    num_instrumentos_esperados = EXCLUDED.num_instrumentos_esperados, version_calculo = EXCLUDED.version_calculo,
    calculada_en = EXCLUDED.calculada_en, instrument_validity = EXCLUDED.instrument_validity,
    has_invalid_instrument = EXCLUDED.has_invalid_instrument
  RETURNING to_jsonb(public.calificaciones_finales.*) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.versioned_instrument_score_rows(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_versioned_instrument_submission_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_calificacion_final(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.versioned_instrument_score_rows(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_versioned_instrument_submission_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_calificacion_final(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
