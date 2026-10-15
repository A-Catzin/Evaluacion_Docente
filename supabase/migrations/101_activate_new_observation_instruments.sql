-- FINAL LOCAL GATE ONLY. Apply separately, by explicit production decision, AFTER
-- 096 catalog, 097-100 schema/revision/scoring, and compatible API/UI deploys.
-- Do not activate drafts against an application still using the old observation RPC.
-- No window is opened here; the independent observation window gate remains in force.
-- A second application fails closed because these exact versions are no longer drafts.
DO $$
DECLARE
  v_expected RECORD;
  v_definition_id UUID;
  v_version_id UUID;
  v_definition_count INTEGER;
  v_distinct_count INTEGER;
  v_draft_count INTEGER;
  v_competing_count INTEGER;
  v_section_count INTEGER;
  v_item_count INTEGER;
  v_invalid_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  -- Parent locks also serialize version inserts through their definition FK.
  -- Version/section/item locks prevent concurrent content or status edits during validation.
  PERFORM 1 FROM public.instrument_definitions d
  WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
    'observation_simulation', 'observation_teaching_competencies') FOR UPDATE OF d;
  PERFORM 1 FROM public.instrument_versions v
  JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
    'observation_simulation', 'observation_teaching_competencies') FOR UPDATE OF v;

  SELECT count(*), count(DISTINCT d.code) INTO v_definition_count, v_distinct_count
  FROM public.instrument_definitions d
  JOIN (VALUES
    ('observation_supervision_clinical', 'Campos clínicos', 24),
    ('observation_professional_practice', 'Práctica Profesional', 24),
    ('observation_simulation', 'Simulación clínica', 30),
    ('observation_teaching_competencies', 'Cultura y Deporte', 24)
  ) AS expected(code, title, item_count) ON d.code = expected.code AND d.title = expected.title
  WHERE d.purpose = 'observation';
  IF v_definition_count <> 4 OR v_distinct_count <> 4 THEN
    RAISE EXCEPTION 'observation activation definitions mismatch';
  END IF;

  SELECT count(*) INTO v_draft_count
  FROM public.instrument_versions v
  JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
    'observation_simulation', 'observation_teaching_competencies')
    AND v.version = 'v1.1' AND v.status = 'draft'
    AND v.effective_to IS NULL AND v.retired_at IS NULL;
  IF v_draft_count <> 4 THEN
    RAISE EXCEPTION 'observation activation requires four draft v1.1 versions';
  END IF;

  SELECT count(*) INTO v_competing_count
  FROM public.instrument_versions v
  JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice',
    'observation_simulation', 'observation_teaching_competencies') AND v.status = 'active';
  IF v_competing_count <> 0 THEN
    RAISE EXCEPTION 'observation activation competing active version';
  END IF;

  FOR v_expected IN SELECT * FROM (VALUES
    ('observation_supervision_clinical', 'Campos clínicos', 24),
    ('observation_professional_practice', 'Práctica Profesional', 24),
    ('observation_simulation', 'Simulación clínica', 30),
    ('observation_teaching_competencies', 'Cultura y Deporte', 24)
  ) AS approved(code, title, item_count) LOOP
    SELECT d.id, v.id INTO v_definition_id, v_version_id
    FROM public.instrument_definitions d
    JOIN public.instrument_versions v ON v.definition_id = d.id
    WHERE d.code = v_expected.code AND d.title = v_expected.title
      AND d.purpose = 'observation' AND v.version = 'v1.1' AND v.status = 'draft'
      AND v.effective_to IS NULL AND v.retired_at IS NULL;

    PERFORM 1 FROM public.instrument_sections s WHERE s.version_id = v_version_id FOR UPDATE OF s;
    PERFORM 1 FROM public.instrument_items i WHERE i.version_id = v_version_id FOR UPDATE OF i;
    SELECT count(*) INTO v_section_count FROM public.instrument_sections s WHERE s.version_id = v_version_id;
    SELECT count(*) INTO v_item_count FROM public.instrument_items i WHERE i.version_id = v_version_id;
    SELECT count(*) INTO v_invalid_count
    FROM public.instrument_items i
    WHERE i.version_id = v_version_id AND (NOT i.scored OR NOT i.na_eligible
      OR i.na_policy <> '{"when":"not_applicable_or_not_observable"}'::jsonb
      OR NOT EXISTS (SELECT 1 FROM public.instrument_sections s
        WHERE s.id = i.section_id AND s.version_id = v_version_id));
    IF v_version_id IS NULL OR v_section_count <> 8 OR v_item_count <> v_expected.item_count
      OR v_invalid_count <> 0 OR EXISTS (SELECT 1 FROM public.instrument_sections s
        WHERE s.version_id = v_version_id AND NOT s.scored)
      OR NOT EXISTS (SELECT 1 FROM public.instrument_versions v WHERE v.id = v_version_id
        AND v.scale_metadata = '{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb
        AND v.scoring_metadata = '{"method":"mean_to_100","raw_scale":"1-3","na_threshold_percent":20}'::jsonb)
    THEN
      RAISE EXCEPTION 'observation activation catalog mismatch';
    END IF;
  END LOOP;

  UPDATE public.instrument_versions v
  SET status = 'active', effective_from = now(), effective_to = NULL
  FROM public.instrument_definitions d
  WHERE v.status = 'draft' AND v.version = 'v1.1'
    AND v.definition_id = d.id AND d.purpose = 'observation'
    AND (d.code, d.title) IN (('observation_supervision_clinical', 'Campos clínicos'),
      ('observation_professional_practice', 'Práctica Profesional'),
      ('observation_simulation', 'Simulación clínica'),
      ('observation_teaching_competencies', 'Cultura y Deporte'));
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 4 THEN
    RAISE EXCEPTION 'observation activation did not transition four versions';
  END IF;
END
$$;
