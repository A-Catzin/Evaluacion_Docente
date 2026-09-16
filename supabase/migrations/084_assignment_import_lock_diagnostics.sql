-- Lock diagnostics for the atomic assignment import. This supersedes migration 083:
-- advisory and row locks fail immediately with SQLSTATE 55P03 instead of waiting for
-- an upstream gateway timeout. The replacement is self-contained for the audit context.
CREATE TABLE IF NOT EXISTS public.assignment_import_audit_suppression_context (
  transaction_id BIGINT PRIMARY KEY,
  backend_pid INTEGER NOT NULL,
  actor_id UUID NOT NULL,
  token UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_import_audit_suppression_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assignment_import_audit_suppression_context FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_assignment_import_row_suppression_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token TEXT := current_setting('app.assignment_import_audit_token', true);
BEGIN
  IF v_token IS NULL OR v_token = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.assignment_import_audit_suppression_context c
    WHERE c.transaction_id = txid_current() AND c.backend_pid = pg_backend_pid()
      AND c.actor_id = auth.uid() AND c.token::TEXT = v_token
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_assignment_import_row_suppression_active() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.apply_assignment_import_sync(
  p_cuatrimestre_id INTEGER, p_archivo_nombre TEXT, p_filas_leidas INTEGER,
  p_resumen JSONB, p_actions JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action JSONB; v_key TEXT; v_plan TEXT; v_group_name TEXT; v_subject_key TEXT;
  v_subject_name TEXT; v_grade TEXT; v_subject_id INTEGER; v_teacher_id INTEGER;
  v_previous_teacher_id INTEGER; v_expected_group_id INTEGER; v_group_id INTEGER;
  v_base_ids INTEGER[]; v_candidate_ids INTEGER[]; v_base_count INTEGER; v_run_id INTEGER;
  v_created INTEGER := 0; v_updated INTEGER := 0; v_noop INTEGER := 0;
  v_subjects_created INTEGER := 0; v_groups_created INTEGER := 0; v_issues_cleaned INTEGER := 0;
  v_seen_keys TEXT[] := ARRAY[]::TEXT[]; v_affected_teacher_ids INTEGER[] := ARRAY[]::INTEGER[];
  v_summary JSONB; v_actor_role TEXT; v_audit_suppression_token UUID;
  v_started_at TIMESTAMPTZ; v_phase TEXT := 'authorization'; v_action_ordinal INTEGER := 0;
  v_action_count INTEGER := 0; v_backend_pid INTEGER := pg_backend_pid();
  v_elapsed_ms BIGINT := 0; v_log_action BOOLEAN := false; v_subject_lock_acquired BOOLEAN := false;
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
  v_action_count := CASE WHEN jsonb_typeof(p_actions) = 'array' THEN jsonb_array_length(p_actions) ELSE 0 END;
  v_phase := 'validation_locks';
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, '', 'before_cycle_nowait', v_backend_pid,
    floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_filas_leidas IS NULL
     OR p_filas_leidas < 0 OR jsonb_typeof(p_actions) <> 'array'
     OR jsonb_array_length(p_actions) > 1000
     OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres WHERE id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid assignment sync proposal' USING ERRCODE = '22023';
  END IF;
  v_phase := 'cycle_lock';
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, '', 'before_cycle_nowait', v_backend_pid,
    floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  BEGIN
    PERFORM 1 FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'cycle lock unavailable: cycle %', p_cuatrimestre_id USING ERRCODE = '55P03';
  END;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, '', 'after_cycle_nowait', v_backend_pid,
    floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;

  DELETE FROM public.import_issues i WHERE i.cuatrimestre_id = p_cuatrimestre_id
    AND i.resolution_status = 'open' AND EXISTS (
      SELECT 1 FROM public.import_runs r WHERE r.id = i.run_id AND r.tipo = 'asignaciones'
    );
  GET DIAGNOSTICS v_issues_cleaned = ROW_COUNT;
  v_phase := 'issue_cleanup';
  v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% issues_cleaned=% backend_pid=% elapsed_ms=%',
    v_phase, p_cuatrimestre_id, 0, '', v_issues_cleaned, v_backend_pid, v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN
    RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, 0 USING ERRCODE = '57014';
  END IF;

  PERFORM set_config('app.assignment_import_audit_token', extensions.gen_random_uuid()::TEXT, true);
  v_audit_suppression_token := current_setting('app.assignment_import_audit_token', true)::UUID;
  INSERT INTO public.assignment_import_audit_suppression_context (transaction_id, backend_pid, actor_id, token)
  VALUES (txid_current(), pg_backend_pid(), auth.uid(), v_audit_suppression_token);

  FOR v_action IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
    v_action_ordinal := v_action_ordinal + 1;
    v_log_action := v_action_ordinal = 1 OR v_action_ordinal = v_action_count OR mod(v_action_ordinal, 100) = 0;
    v_phase := 'subject_resolution';
    v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    IF v_log_action THEN
      RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% actions=% backend_pid=% elapsed_ms=%',
        v_phase, p_cuatrimestre_id, v_action_ordinal, '', v_action_count, v_backend_pid, v_elapsed_ms;
    END IF;
    IF v_elapsed_ms > v_elapsed_budget_ms THEN
      RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %', v_phase, v_action_ordinal USING ERRCODE = '57014';
    END IF;
    IF NOT (v_action ?& ARRAY['assignment_key','plan','group_name','subject_key','subject_name','teacher_id','base_ids','base_key','num_alumnos'])
       OR coalesce(v_action->>'teacher_id', '') !~ '^[1-9][0-9]*$'
       OR jsonb_typeof(v_action->'base_ids') <> 'array' THEN
      RAISE EXCEPTION 'invalid assignment sync action' USING ERRCODE = '22023';
    END IF;
    v_plan := translate(upper(regexp_replace(trim(coalesce(v_action->>'plan','')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
    v_group_name := regexp_replace(translate(upper(regexp_replace(trim(coalesce(v_action->>'group_name','')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g');
    v_subject_key := translate(upper(regexp_replace(trim(coalesce(v_action->>'subject_key','')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
    v_subject_name := trim(coalesce(v_action->>'subject_name','')); v_grade := trim(coalesce(v_action->>'grade',''));
    v_key := p_cuatrimestre_id::TEXT || '|' || v_plan || '|' || v_group_name || '|' || v_subject_key;
    v_teacher_id := (v_action->>'teacher_id')::INTEGER;
    v_previous_teacher_id := nullif(v_action->>'previous_teacher_id','')::INTEGER;
    v_expected_group_id := nullif(v_action->>'existing_group_id','')::INTEGER;
    SELECT array_agg(value::TEXT::INTEGER ORDER BY value::TEXT::INTEGER) INTO v_base_ids
      FROM jsonb_array_elements(v_action->'base_ids');
    IF v_plan = '' OR v_group_name = '' OR v_subject_key = '' OR v_subject_name = ''
       OR v_action->>'assignment_key' <> v_key
       OR cardinality(v_base_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_base_ids))) THEN
      RAISE EXCEPTION 'unsafe assignment sync identity' USING ERRCODE = '22023';
    END IF;
    IF v_key = ANY(v_seen_keys) THEN RAISE EXCEPTION 'duplicate assignment action' USING ERRCODE = '22023'; END IF;
    v_seen_keys := array_append(v_seen_keys, v_key);
    IF NOT EXISTS (SELECT 1 FROM public.docentes WHERE id = v_teacher_id AND activo = true) THEN
      RAISE EXCEPTION 'teacher is no longer valid' USING ERRCODE = '23503';
    END IF;

    v_phase := 'subject_advisory_lock';
    RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
      v_phase, p_cuatrimestre_id, v_action_ordinal, left(v_subject_key, 160), 'before_subject_try_lock', v_backend_pid,
      floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    v_subject_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('assignment-import-subject:' || v_subject_key, 0)
    );
    RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% acquired=% backend_pid=% elapsed_ms=%',
      v_phase, p_cuatrimestre_id, v_action_ordinal, left(v_subject_key, 160), 'after_subject_try_lock', v_subject_lock_acquired,
      v_backend_pid, floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    IF NOT v_subject_lock_acquired THEN
      RAISE EXCEPTION 'subject lock unavailable: cycle % subject %', p_cuatrimestre_id, left(v_subject_key, 160) USING ERRCODE = '55P03';
    END IF;
    SELECT array_agg(s.id ORDER BY s.id) INTO v_candidate_ids FROM public.asignaturas s
      WHERE translate(upper(regexp_replace(trim(coalesce(s.clave,'')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = v_subject_key;
    IF coalesce(cardinality(v_candidate_ids), 0) > 1 THEN
      RAISE EXCEPTION 'ambiguous subject key' USING ERRCODE = '40001';
    ELSIF coalesce(cardinality(v_candidate_ids), 0) = 1 THEN
      v_subject_id := v_candidate_ids[1];
    ELSE
      INSERT INTO public.asignaturas (clave,nombre,activa) VALUES (v_subject_key,v_subject_name,true) RETURNING id INTO v_subject_id;
      v_subjects_created := v_subjects_created + 1;
    END IF;

    v_phase := 'base_group_validation'; v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    IF v_log_action THEN RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% backend_pid=% elapsed_ms=%', v_phase,p_cuatrimestre_id,v_action_ordinal,left(v_key,160),v_backend_pid,v_elapsed_ms; END IF;
    IF v_elapsed_ms > v_elapsed_budget_ms THEN RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %',v_phase,v_action_ordinal USING ERRCODE = '57014'; END IF;
    IF coalesce(cardinality(v_base_ids), 0) > 0 THEN
      SELECT count(*) INTO v_base_count FROM public.grupos b WHERE b.id = ANY(v_base_ids)
        AND b.cuatrimestre_id = p_cuatrimestre_id AND b.activo = true AND b.asignatura_id IS NULL
        AND translate(upper(regexp_replace(trim(coalesce(b.plan_normalizado,'')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = v_plan
        AND regexp_replace(translate(upper(regexp_replace(trim(coalesce(b.grupo_normalizado,b.clave,'')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') = v_group_name;
      IF v_base_count <> cardinality(v_base_ids) THEN RAISE EXCEPTION 'base group changed since preview' USING ERRCODE = '40001'; END IF;
    END IF;

    v_phase := 'target_resolution'; v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    IF v_log_action THEN RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% backend_pid=% elapsed_ms=%', v_phase,p_cuatrimestre_id,v_action_ordinal,left(v_key,160),v_backend_pid,v_elapsed_ms; END IF;
    IF v_elapsed_ms > v_elapsed_budget_ms THEN RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %',v_phase,v_action_ordinal USING ERRCODE = '57014'; END IF;
    SELECT array_agg(g.id ORDER BY g.id) INTO v_candidate_ids FROM public.grupos g
      WHERE g.cuatrimestre_id = p_cuatrimestre_id AND g.activo = true AND g.asignatura_id = v_subject_id
      AND (g.importacion_key = v_key OR (
        translate(upper(regexp_replace(trim(coalesce(g.plan_normalizado,'')), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = v_plan
        AND regexp_replace(translate(upper(regexp_replace(trim(coalesce(g.grupo_normalizado,g.clave,'')), '_+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g') = v_group_name));
    IF coalesce(cardinality(v_candidate_ids),0) > 1
       OR (v_expected_group_id IS NULL AND coalesce(cardinality(v_candidate_ids),0) <> 0)
       OR (v_expected_group_id IS NOT NULL AND (coalesce(cardinality(v_candidate_ids),0) <> 1 OR v_candidate_ids[1] <> v_expected_group_id)) THEN
      RAISE EXCEPTION 'assignment target changed since preview' USING ERRCODE = '40001';
    END IF;

    v_phase := 'group_write_enrollment_copy'; v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    IF v_log_action THEN RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% backend_pid=% elapsed_ms=%', v_phase,p_cuatrimestre_id,v_action_ordinal,left(v_key,160),v_backend_pid,v_elapsed_ms; END IF;
    IF v_elapsed_ms > v_elapsed_budget_ms THEN RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %',v_phase,v_action_ordinal USING ERRCODE = '57014'; END IF;
    IF v_expected_group_id IS NULL THEN
      INSERT INTO public.grupos (clave,cuatrimestre_id,asignatura_id,docente_id,plan_normalizado,grado,grupo_normalizado,num_alumnos,activo,importacion_key)
      VALUES (v_action->>'base_key',p_cuatrimestre_id,v_subject_id,v_teacher_id,v_plan,nullif(v_grade,''),v_group_name,coalesce((v_action->>'num_alumnos')::INTEGER,0),true,v_key) RETURNING id INTO v_group_id;
      IF coalesce(cardinality(v_base_ids),0) > 0 THEN
        INSERT INTO public.inscripciones (estudiante_id,grupo_id,cuatrimestre_id)
        SELECT DISTINCT i.estudiante_id,v_group_id,i.cuatrimestre_id FROM public.inscripciones i
        WHERE i.grupo_id = ANY(v_base_ids) AND i.cuatrimestre_id = p_cuatrimestre_id
        ON CONFLICT (estudiante_id,grupo_id,cuatrimestre_id) DO NOTHING;
      END IF;
      v_created := v_created + 1; v_groups_created := v_groups_created + 1;
      v_affected_teacher_ids := array_append(v_affected_teacher_ids,v_teacher_id);
    ELSE
      v_phase := 'target_group_lock';
      RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
        v_phase,p_cuatrimestre_id,v_action_ordinal,left(v_key,160),'before_target_group_nowait',v_backend_pid,
        floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
      BEGIN
        SELECT id INTO v_group_id FROM public.grupos WHERE id = v_expected_group_id FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'target group lock unavailable: cycle % subject %', p_cuatrimestre_id, left(v_subject_key, 160) USING ERRCODE = '55P03';
      END;
      RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% lock_marker=% backend_pid=% elapsed_ms=%',
        v_phase,p_cuatrimestre_id,v_action_ordinal,left(v_key,160),'after_target_group_nowait',v_backend_pid,
        floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
      IF (SELECT docente_id FROM public.grupos WHERE id = v_group_id) IS DISTINCT FROM v_previous_teacher_id THEN RAISE EXCEPTION 'assignment teacher changed since preview' USING ERRCODE = '40001'; END IF;
      IF v_previous_teacher_id IS DISTINCT FROM v_teacher_id THEN
        UPDATE public.grupos SET docente_id = v_teacher_id,importacion_key = v_key WHERE id = v_group_id;
        v_updated := v_updated + 1; v_affected_teacher_ids := array_append(v_affected_teacher_ids,v_teacher_id);
        IF v_previous_teacher_id IS NOT NULL THEN v_affected_teacher_ids := array_append(v_affected_teacher_ids,v_previous_teacher_id); END IF;
      ELSE
        UPDATE public.grupos SET importacion_key = v_key WHERE id = v_group_id AND importacion_key IS DISTINCT FROM v_key;
        v_noop := v_noop + 1;
      END IF;
    END IF;
  END LOOP;

  v_phase := 'import_run_audit_summary'; v_elapsed_ms := floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
  RAISE LOG 'assignment_import phase=% cycle_id=% action=% key=% created=% updated=% groups_created=% issues_cleaned=% backend_pid=% elapsed_ms=%', v_phase,p_cuatrimestre_id,v_action_ordinal,left(coalesce(v_key,''),160),v_created,v_updated,v_groups_created,v_issues_cleaned,v_backend_pid,v_elapsed_ms;
  IF v_elapsed_ms > v_elapsed_budget_ms THEN RAISE EXCEPTION 'assignment import elapsed budget exceeded at phase % action %',v_phase,v_action_ordinal USING ERRCODE = '57014'; END IF;
  v_summary := coalesce(p_resumen,'{}'::jsonb) || jsonb_build_object('rowsRead',p_filas_leidas,'assignmentCreated',v_created,'assignmentUpdated',v_updated,'assignmentNoOp',v_noop,'subjectsCreated',v_subjects_created,'groupsCreated',v_groups_created,'issuesCleaned',v_issues_cleaned);
  INSERT INTO public.import_runs (tipo,cuatrimestre_id,archivo_nombre,created_by,resumen,finished_at,filas_leidas)
  VALUES ('asignaciones',p_cuatrimestre_id,left(coalesce(p_archivo_nombre,'asignaciones.csv'),255),auth.uid(),v_summary,now(),p_filas_leidas) RETURNING id INTO v_run_id;
  DELETE FROM public.assignment_import_audit_suppression_context WHERE transaction_id = txid_current() AND backend_pid = pg_backend_pid() AND actor_id = auth.uid() AND token = v_audit_suppression_token;
  PERFORM set_config('app.assignment_import_audit_token','',true);
  PERFORM public.audit_write_event(auth.uid(),v_actor_role,'admin.assignment_import','assignment_import.completed',NULL,'import_runs',jsonb_build_object('id',v_run_id,'cuatrimestre_id',p_cuatrimestre_id),'insert','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,jsonb_build_object('run_id',v_run_id,'cuatrimestre_id',p_cuatrimestre_id,'rows_read',p_filas_leidas,'assignment_created',v_created,'assignment_updated',v_updated,'assignment_no_op',v_noop,'subjects_created',v_subjects_created,'groups_created',v_groups_created,'issues_cleaned',v_issues_cleaned));
  RETURN jsonb_build_object('runId',v_run_id,'issuesCleaned',v_issues_cleaned,'subjectsCreated',v_subjects_created,'groupsCreated',v_groups_created,'affectedTeacherIds',ARRAY(SELECT DISTINCT unnest(v_affected_teacher_ids) ORDER BY 1));
EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG 'assignment_import failure=lock_contention cycle_id=% phase=% action=% backend_pid=% elapsed_ms=%',p_cuatrimestre_id,v_phase,v_action_ordinal,v_backend_pid,floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    RAISE;
  WHEN deadlock_detected THEN
    RAISE LOG 'assignment_import failure=deadlock cycle_id=% phase=% action=% backend_pid=% elapsed_ms=%',p_cuatrimestre_id,v_phase,v_action_ordinal,v_backend_pid,floor(extract(epoch FROM clock_timestamp() - v_started_at) * 1000)::BIGINT;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_assignment_import_sync(INTEGER,TEXT,INTEGER,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_assignment_import_sync(INTEGER,TEXT,INTEGER,JSONB,JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
