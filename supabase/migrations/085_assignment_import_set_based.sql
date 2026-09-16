-- Set-based replacement for the timeout-prone per-action assignment import RPC.
-- All temporary state is transaction-scoped; validation and locks complete before
-- issue cleanup, audit suppression, or any durable subject/group/enrollment write.
CREATE OR REPLACE FUNCTION public.apply_assignment_import_sync(
  p_cuatrimestre_id INTEGER,
  p_archivo_nombre TEXT,
  p_filas_leidas INTEGER,
  p_resumen JSONB,
  p_actions JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_role TEXT;
  v_subject_key TEXT;
  v_target_group_id INTEGER;
  v_run_id INTEGER;
  v_created INTEGER := 0;
  v_updated INTEGER := 0;
  v_noop INTEGER := 0;
  v_subjects_created INTEGER := 0;
  v_groups_created INTEGER := 0;
  v_issues_cleaned INTEGER := 0;
  v_summary JSONB;
  v_audit_suppression_token UUID;
  v_subject_lock_acquired BOOLEAN;
  v_started_at TIMESTAMPTZ;
  v_phase TEXT := 'authorization';
  v_elapsed_ms BIGINT := 0;
  v_backend_pid INTEGER := pg_backend_pid();
  v_elapsed_budget_ms CONSTANT INTEGER := 82000;
BEGIN
  IF NOT public.audit_is_superadmin() THEN
    RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501';
  END IF;
  SELECT u.rol INTO v_actor_role FROM public.usuarios u WHERE u.id = auth.uid();
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'authenticated user role required' USING ERRCODE = '42501';
  END IF;

  v_started_at := clock_timestamp();
  PERFORM set_config('lock_timeout', '10s', true);
  PERFORM set_config('statement_timeout', '85s', true);
  PERFORM set_config('application_name', 'assignment_import_set_based', true);

  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
     OR p_filas_leidas IS NULL OR p_filas_leidas < 0
     OR pg_catalog.jsonb_typeof(p_actions) <> 'array'
     OR pg_catalog.jsonb_array_length(p_actions) > 1000
     OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres WHERE id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid assignment sync proposal' USING ERRCODE = '22023';
  END IF;

  v_phase := 'cycle_lock';
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, v_backend_pid,
    floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  BEGIN
    PERFORM 1 FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'cycle lock unavailable: cycle %', p_cuatrimestre_id USING ERRCODE = '55P03';
  END;

  -- Keep raw scalar values textual until every cast has been validated.
  v_phase := 'action_staging';
  CREATE TEMP TABLE import_assignment_actions ON COMMIT DROP AS
  SELECT
    e.ordinality::INTEGER AS ordinal,
    e.value AS action,
    e.value->>'assignment_key' AS assignment_key,
    translate(upper(regexp_replace(trim(coalesce(e.value->>'plan', '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') AS plan,
    regexp_replace(translate(upper(regexp_replace(trim(coalesce(e.value->>'group_name', '')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') AS group_name,
    translate(upper(regexp_replace(trim(coalesce(e.value->>'subject_key', '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') AS subject_key,
    trim(coalesce(e.value->>'subject_name', '')) AS subject_name,
    trim(coalesce(e.value->>'grade', '')) AS grade,
    e.value->>'teacher_id' AS teacher_id_text,
    e.value->>'previous_teacher_id' AS previous_teacher_id_text,
    e.value->>'existing_group_id' AS existing_group_id_text,
    e.value->>'base_key' AS base_key,
    e.value->>'num_alumnos' AS num_alumnos_text,
    e.value->'base_ids' AS base_ids_json
  FROM pg_catalog.jsonb_array_elements(p_actions) WITH ORDINALITY AS e(value, ordinality);

  IF EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_actions a
    WHERE pg_catalog.jsonb_typeof(a.action) <> 'object'
       OR NOT (a.action ?& ARRAY['assignment_key', 'plan', 'group_name', 'subject_key', 'subject_name', 'teacher_id', 'base_ids', 'base_key', 'num_alumnos'])
       OR coalesce(a.teacher_id_text, '') !~ '^[1-9][0-9]*$'
       OR (nullif(a.previous_teacher_id_text, '') IS NOT NULL AND a.previous_teacher_id_text !~ '^[1-9][0-9]*$')
       OR (nullif(a.existing_group_id_text, '') IS NOT NULL AND a.existing_group_id_text !~ '^[1-9][0-9]*$')
       OR (nullif(a.num_alumnos_text, '') IS NOT NULL AND a.num_alumnos_text !~ '^-?[0-9]+$')
       OR pg_catalog.jsonb_typeof(a.base_ids_json) <> 'array'
  ) OR EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(a.base_ids_json) AS b(value)
    WHERE b.value !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'invalid assignment sync action' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE import_assignment_base_ids ON COMMIT DROP AS
  SELECT a.ordinal, b.value::INTEGER AS base_id
  FROM pg_temp.import_assignment_actions a
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(a.base_ids_json) AS b(value);

  IF EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_base_ids b WHERE b.base_id <= 0
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_base_ids b
    GROUP BY b.ordinal, b.base_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_actions a
    WHERE a.plan = '' OR a.group_name = '' OR a.subject_key = '' OR a.subject_name = ''
       OR a.assignment_key IS NULL
       OR a.assignment_key <> p_cuatrimestre_id::TEXT || '|' || a.plan || '|' || a.group_name || '|' || a.subject_key
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_actions a
    GROUP BY a.assignment_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'unsafe assignment sync identity' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    LEFT JOIN public.docentes d ON d.id = a.teacher_id_text::INTEGER AND d.activo = true
    WHERE d.id IS NULL
  ) THEN
    RAISE EXCEPTION 'teacher is no longer valid' USING ERRCODE = '23503';
  END IF;
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%', v_phase, p_cuatrimestre_id, 0, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  -- Validate every previewed base row in one pass before creating anything.
  v_phase := 'base_group_validation';
  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_base_ids ab
    JOIN pg_temp.import_assignment_actions a ON a.ordinal = ab.ordinal
    LEFT JOIN public.grupos b ON b.id = ab.base_id
      AND b.cuatrimestre_id = p_cuatrimestre_id
      AND b.activo = true
      AND b.asignatura_id IS NULL
      AND translate(upper(regexp_replace(trim(coalesce(b.plan_normalizado, '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = a.plan
      AND regexp_replace(translate(upper(regexp_replace(trim(coalesce(b.grupo_normalizado, b.clave, '')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') = a.group_name
    WHERE b.id IS NULL
  ) THEN
    RAISE EXCEPTION 'base group changed since preview' USING ERRCODE = '40001';
  END IF;
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%', v_phase, p_cuatrimestre_id, 0, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  -- A distinct, deterministic lock pass makes global subject creation safe without a
  -- per-action normalized asignaturas scan or reliance on an uncertain unique index.
  v_phase := 'subject_resolution';
  CREATE TEMP TABLE import_assignment_subjects ON COMMIT DROP AS
  SELECT DISTINCT ON (a.subject_key) a.subject_key, a.subject_name, NULL::INTEGER AS subject_id
  FROM pg_temp.import_assignment_actions a
  ORDER BY a.subject_key, a.ordinal;

  FOR v_subject_key IN
    SELECT s.subject_key FROM pg_temp.import_assignment_subjects s ORDER BY s.subject_key
  LOOP
    v_subject_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('assignment-import-subject:' || v_subject_key, 0)
    );
    IF NOT v_subject_lock_acquired THEN
      RAISE EXCEPTION 'subject lock unavailable: cycle % subject %', p_cuatrimestre_id, left(v_subject_key, 160) USING ERRCODE = '55P03';
    END IF;
  END LOOP;

  CREATE TEMP TABLE import_assignment_subject_candidates ON COMMIT DROP AS
  SELECT s.subject_key, array_agg(a.id ORDER BY a.id) AS candidate_ids
  FROM pg_temp.import_assignment_subjects s
  JOIN public.asignaturas a
    ON translate(upper(regexp_replace(trim(coalesce(a.clave, '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = s.subject_key
  GROUP BY s.subject_key;

  IF EXISTS (
    SELECT 1 FROM pg_temp.import_assignment_subject_candidates c
    WHERE cardinality(c.candidate_ids) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous subject key' USING ERRCODE = '40001';
  END IF;

  UPDATE pg_temp.import_assignment_subjects s
  SET subject_id = c.candidate_ids[1]
  FROM pg_temp.import_assignment_subject_candidates c
  WHERE c.subject_key = s.subject_key;

  -- Missing subjects remain staged until the target identity and every NOWAIT lock
  -- have validated. Existing IDs are enough to resolve all possible current targets.
  ALTER TABLE pg_temp.import_assignment_actions ADD COLUMN subject_id INTEGER;
  UPDATE pg_temp.import_assignment_actions a
  SET subject_id = s.subject_id
  FROM pg_temp.import_assignment_subjects s
  WHERE s.subject_key = a.subject_key AND s.subject_id IS NOT NULL;
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%', v_phase, p_cuatrimestre_id, 0, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  -- Resolve all active target candidates for this cycle exactly once. A target is either
  -- keyed by importacion_key or has the same subject/normalized plan/normalized group.
  v_phase := 'target_resolution';
  CREATE TEMP TABLE import_assignment_targets ON COMMIT DROP AS
  SELECT a.ordinal, count(g.id)::INTEGER AS candidate_count, min(g.id)::INTEGER AS target_group_id
  FROM pg_temp.import_assignment_actions a
  LEFT JOIN public.grupos g ON g.cuatrimestre_id = p_cuatrimestre_id
    AND g.activo = true
    AND g.asignatura_id = a.subject_id
    AND (g.importacion_key = a.assignment_key OR (
      translate(upper(regexp_replace(trim(coalesce(g.plan_normalizado, '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = a.plan
      AND regexp_replace(translate(upper(regexp_replace(trim(coalesce(g.grupo_normalizado, g.clave, '')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') = a.group_name
    ))
  GROUP BY a.ordinal;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    JOIN pg_temp.import_assignment_targets t ON t.ordinal = a.ordinal
    WHERE t.candidate_count > 1
       OR (nullif(a.existing_group_id_text, '') IS NULL AND t.candidate_count <> 0)
       OR (nullif(a.existing_group_id_text, '') IS NOT NULL
           AND (t.candidate_count <> 1 OR t.target_group_id <> a.existing_group_id_text::INTEGER))
  ) THEN
    RAISE EXCEPTION 'assignment target changed since preview' USING ERRCODE = '40001';
  END IF;

  ALTER TABLE pg_temp.import_assignment_actions ADD COLUMN target_group_id INTEGER;
  UPDATE pg_temp.import_assignment_actions a
  SET target_group_id = t.target_group_id
  FROM pg_temp.import_assignment_targets t
  WHERE t.ordinal = a.ordinal;

  -- Lock every existing target once, in ID order, before any durable write. This is a
  -- separate deterministic pass from subject locks and fails immediately on contention.
  v_phase := 'target_group_lock';
  FOR v_target_group_id IN
    SELECT DISTINCT a.target_group_id
    FROM pg_temp.import_assignment_actions a
    WHERE a.target_group_id IS NOT NULL
    ORDER BY a.target_group_id
  LOOP
    BEGIN
      PERFORM 1 FROM public.grupos g WHERE g.id = v_target_group_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'target group lock unavailable: cycle % group %', p_cuatrimestre_id, v_target_group_id USING ERRCODE = '55P03';
    END;
  END LOOP;

  -- Recheck the locked row identities set-wise. This catches a direct concurrent
  -- change between candidate staging and NOWAIT acquisition without another full scan.
  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    LEFT JOIN public.grupos g ON g.id = a.target_group_id
    WHERE a.target_group_id IS NOT NULL AND (
      g.id IS NULL OR g.cuatrimestre_id IS DISTINCT FROM p_cuatrimestre_id
      OR g.activo IS DISTINCT FROM true OR g.asignatura_id IS DISTINCT FROM a.subject_id
      OR NOT (g.importacion_key = a.assignment_key OR (
        translate(upper(regexp_replace(trim(coalesce(g.plan_normalizado, '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = a.plan
        AND regexp_replace(translate(upper(regexp_replace(trim(coalesce(g.grupo_normalizado, g.clave, '')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') = a.group_name
      ))
    )
  ) THEN
    RAISE EXCEPTION 'assignment target changed since preview' USING ERRCODE = '40001';
  END IF;
  -- Recheck teacher IDs only after the deterministic target-lock pass.
  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    JOIN public.grupos g ON g.id = a.target_group_id
    WHERE a.target_group_id IS NOT NULL
      AND g.docente_id IS DISTINCT FROM nullif(a.previous_teacher_id_text, '')::INTEGER
  ) THEN
    RAISE EXCEPTION 'assignment teacher changed since preview' USING ERRCODE = '40001';
  END IF;
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%', v_phase, p_cuatrimestre_id, 0, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  -- Validation and locking are complete. Only now may stale open issues be removed and
  -- high-volume row audit events be suppressed by the token bound to this transaction.
  v_phase := 'issue_cleanup';
  DELETE FROM public.import_issues i
  WHERE i.cuatrimestre_id = p_cuatrimestre_id
    AND i.resolution_status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.import_runs r WHERE r.id = i.run_id AND r.tipo = 'asignaciones'
    );
  GET DIAGNOSTICS v_issues_cleaned = ROW_COUNT;
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% issues_cleaned=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, v_issues_cleaned, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  PERFORM set_config('app.assignment_import_audit_token', extensions.gen_random_uuid()::TEXT, true);
  v_audit_suppression_token := current_setting('app.assignment_import_audit_token', true)::UUID;
  INSERT INTO public.assignment_import_audit_suppression_context (transaction_id, backend_pid, actor_id, token)
  VALUES (txid_current(), pg_backend_pid(), auth.uid(), v_audit_suppression_token);

  -- Subject creation is now safe: all proposal, base, and target validations and
  -- deterministic locks succeeded, and distinct subject locks protect this insert.
  WITH inserted AS (
    INSERT INTO public.asignaturas (clave, nombre, activa)
    SELECT s.subject_key, s.subject_name, true
    FROM pg_temp.import_assignment_subjects s
    WHERE s.subject_id IS NULL
    RETURNING id, clave
  )
  UPDATE pg_temp.import_assignment_subjects s
  SET subject_id = i.id
  FROM inserted i
  WHERE s.subject_id IS NULL
    AND s.subject_key = translate(upper(regexp_replace(trim(coalesce(i.clave, '')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
  GET DIAGNOSTICS v_subjects_created = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM pg_temp.import_assignment_subjects WHERE subject_id IS NULL) THEN
    RAISE EXCEPTION 'subject resolution failed closed' USING ERRCODE = '40001';
  END IF;

  UPDATE pg_temp.import_assignment_actions a
  SET subject_id = s.subject_id
  FROM pg_temp.import_assignment_subjects s
  WHERE s.subject_key = a.subject_key;

  v_phase := 'group_write_enrollment_copy';
  CREATE TEMP TABLE import_assignment_created_groups (
    ordinal INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL
  ) ON COMMIT DROP;

  WITH inserted AS (
    INSERT INTO public.grupos (
      clave, cuatrimestre_id, asignatura_id, docente_id, plan_normalizado, grado,
      grupo_normalizado, num_alumnos, activo, importacion_key
    )
    SELECT a.base_key, p_cuatrimestre_id, a.subject_id, a.teacher_id_text::INTEGER,
      a.plan, nullif(a.grade, ''), a.group_name, coalesce(nullif(a.num_alumnos_text, '')::INTEGER, 0),
      true, a.assignment_key
    FROM pg_temp.import_assignment_actions a
    WHERE a.target_group_id IS NULL
    RETURNING id, importacion_key, asignatura_id, cuatrimestre_id
  )
  INSERT INTO pg_temp.import_assignment_created_groups (ordinal, group_id)
  SELECT a.ordinal, i.id
  FROM pg_temp.import_assignment_actions a
  JOIN inserted i ON i.importacion_key = a.assignment_key
    AND i.asignatura_id = a.subject_id
    AND i.cuatrimestre_id = p_cuatrimestre_id
  WHERE a.target_group_id IS NULL;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.import_assignment_actions a
    LEFT JOIN pg_temp.import_assignment_created_groups c ON c.ordinal = a.ordinal
    WHERE a.target_group_id IS NULL AND c.group_id IS NULL
  ) THEN
    RAISE EXCEPTION 'created assignment mapping failed closed' USING ERRCODE = '40001';
  END IF;
  SELECT count(*) INTO v_created FROM pg_temp.import_assignment_created_groups;
  v_groups_created := v_created;

  -- Preserve existing group IDs and their dependent history. Only teacher changes count
  -- as updates or affect teacher recalculation, but same-teacher targets still receive a
  -- changed canonical import key so legacy keys converge without changing action counts.
  UPDATE public.grupos g
  SET docente_id = a.teacher_id_text::INTEGER, importacion_key = a.assignment_key
  FROM pg_temp.import_assignment_actions a
  WHERE g.id = a.target_group_id
    AND nullif(a.previous_teacher_id_text, '')::INTEGER IS DISTINCT FROM a.teacher_id_text::INTEGER;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.grupos g
  SET importacion_key = a.assignment_key
  FROM pg_temp.import_assignment_actions a
  WHERE g.id = a.target_group_id
    AND nullif(a.previous_teacher_id_text, '')::INTEGER IS NOT DISTINCT FROM a.teacher_id_text::INTEGER
    AND g.importacion_key IS DISTINCT FROM a.assignment_key;

  SELECT count(*) INTO v_noop
  FROM pg_temp.import_assignment_actions a
  WHERE a.target_group_id IS NOT NULL
    AND nullif(a.previous_teacher_id_text, '')::INTEGER IS NOT DISTINCT FROM a.teacher_id_text::INTEGER;

  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% created=% updated=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, v_created, v_updated, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  v_phase := 'import_run_audit_summary';
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% backend_pid=% elapsed_ms=%', v_phase, p_cuatrimestre_id, 0, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;
  v_summary := coalesce(p_resumen, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'rowsRead', p_filas_leidas, 'assignmentCreated', v_created,
    'assignmentUpdated', v_updated, 'assignmentNoOp', v_noop,
    'subjectsCreated', v_subjects_created, 'groupsCreated', v_groups_created,
    'issuesCleaned', v_issues_cleaned
  );
  INSERT INTO public.import_runs (tipo, cuatrimestre_id, archivo_nombre, created_by, resumen, finished_at, filas_leidas)
  VALUES ('asignaciones', p_cuatrimestre_id, left(coalesce(p_archivo_nombre, 'asignaciones.csv'), 255), auth.uid(), v_summary, now(), p_filas_leidas)
  RETURNING id INTO v_run_id;

  DELETE FROM public.assignment_import_audit_suppression_context
  WHERE transaction_id = txid_current() AND backend_pid = pg_backend_pid()
    AND actor_id = auth.uid() AND token = v_audit_suppression_token;
  PERFORM set_config('app.assignment_import_audit_token', '', true);
  PERFORM public.audit_write_event(
    auth.uid(), v_actor_role, 'admin.assignment_import', 'assignment_import.completed', NULL,
    'import_runs', pg_catalog.jsonb_build_object('id', v_run_id, 'cuatrimestre_id', p_cuatrimestre_id), 'insert',
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'run_id', v_run_id, 'cuatrimestre_id', p_cuatrimestre_id, 'rows_read', p_filas_leidas,
      'assignment_created', v_created, 'assignment_updated', v_updated,
      'assignment_no_op', v_noop, 'subjects_created', v_subjects_created,
      'groups_created', v_groups_created, 'issues_cleaned', v_issues_cleaned
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'runId', v_run_id, 'issuesCleaned', v_issues_cleaned,
    'subjectsCreated', v_subjects_created, 'groupsCreated', v_groups_created,
    'affectedTeacherIds', ARRAY(
      SELECT DISTINCT teacher_id FROM (
        SELECT a.teacher_id_text::INTEGER AS teacher_id
        FROM pg_temp.import_assignment_actions a
        WHERE a.target_group_id IS NULL
           OR nullif(a.previous_teacher_id_text, '')::INTEGER IS DISTINCT FROM a.teacher_id_text::INTEGER
        UNION ALL
        SELECT nullif(a.previous_teacher_id_text, '')::INTEGER
        FROM pg_temp.import_assignment_actions a
        WHERE a.target_group_id IS NOT NULL
          AND nullif(a.previous_teacher_id_text, '')::INTEGER IS DISTINCT FROM a.teacher_id_text::INTEGER
          AND nullif(a.previous_teacher_id_text, '') IS NOT NULL
      ) affected
      ORDER BY teacher_id
    )
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG 'assignment_import failure=lock_contention cycle_id=% phase=% backend_pid=% elapsed_ms=%',
      p_cuatrimestre_id, v_phase, v_backend_pid,
      floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    RAISE;
  WHEN deadlock_detected THEN
    RAISE LOG 'assignment_import failure=deadlock cycle_id=% phase=% backend_pid=% elapsed_ms=%',
      p_cuatrimestre_id, v_phase, v_backend_pid,
      floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_assignment_import_sync(INTEGER, TEXT, INTEGER, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_assignment_import_sync(INTEGER, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
