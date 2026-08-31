-- An evaluator must have both an enabled Auth account and an enabled application
-- profile. Migration 052 displayed RPC failures as an empty UI list, obscuring
-- whether the problem was deployment, a missing profile, or account eligibility.

CREATE OR REPLACE FUNCTION public.is_active_superadmin(p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id
    WHERE u.id = p_actor_id
      AND u.rol = 'superadmin'
      AND u.activo IS TRUE
      AND au.deleted_at IS NULL
      AND (au.banned_until IS NULL OR au.banned_until <= now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_active_coordinator(p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id
    WHERE u.id = p_actor_id
      AND u.rol = 'coordinador'
      AND u.activo IS TRUE
      AND au.deleted_at IS NULL
      AND (au.banned_until IS NULL OR au.banned_until <= now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_active_observation_evaluator(p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id
    WHERE u.id = p_actor_id
      AND u.rol IN ('superadmin', 'coordinador', 'observador')
      AND u.activo IS TRUE
      AND au.deleted_at IS NULL
      AND (au.banned_until IS NULL OR au.banned_until <= now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.audit_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_active_superadmin(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.validate_teacher_assignment_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id UUID;
BEGIN
  v_actor_id := CASE WHEN TG_TABLE_NAME = 'coordinated_teacher_assignments' THEN NEW.coordinador_id ELSE NEW.evaluator_id END;
  IF (TG_TABLE_NAME = 'coordinated_teacher_assignments' AND NOT public.is_active_coordinator(v_actor_id))
    OR (TG_TABLE_NAME = 'observation_teacher_assignments' AND NOT public.is_active_observation_evaluator(v_actor_id)) THEN
    RAISE EXCEPTION 'active resolved actor with an allowed role required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.docentes d WHERE d.id = NEW.docente_id) THEN
    RAISE EXCEPTION 'teacher required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.docente_id IS DISTINCT FROM OLD.docente_id OR NEW.cuatrimestre_id IS DISTINCT FROM OLD.cuatrimestre_id
    OR v_actor_id IS DISTINCT FROM CASE WHEN TG_TABLE_NAME = 'coordinated_teacher_assignments' THEN OLD.coordinador_id ELSE OLD.evaluator_id END
    OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
    OR NEW.source IS DISTINCT FROM OLD.source
  ) THEN
    RAISE EXCEPTION 'assignment identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_observation_allocation_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.target_teacher_count IS NOT NULL AND NEW.target_teacher_count NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'target must be between zero and 10000' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_active_observation_evaluator(NEW.evaluator_id) THEN
    RAISE EXCEPTION 'active resolved observation evaluator required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_coordinated_teacher(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_actor_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_docente_id > 0 AND p_cuatrimestre_id > 0 AND (
    public.is_active_superadmin(p_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.coordinated_teacher_assignments a
      WHERE a.coordinador_id = p_actor_id
        AND a.docente_id = p_docente_id
        AND a.cuatrimestre_id = p_cuatrimestre_id
        AND a.revoked_at IS NULL
        AND public.is_active_coordinator(a.coordinador_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_observe_assigned_teacher(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_actor_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_docente_id > 0 AND p_cuatrimestre_id > 0 AND (
    public.is_active_superadmin(p_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.observation_teacher_assignments a
      WHERE a.evaluator_id = p_actor_id
        AND a.docente_id = p_docente_id
        AND a.cuatrimestre_id = p_cuatrimestre_id
        AND a.revoked_at IS NULL
        AND public.is_active_observation_evaluator(a.evaluator_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.enforce_staff_assignment_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role TEXT; v_docente_id INTEGER; v_cycle_id INTEGER;
BEGIN
  IF public.is_active_superadmin(auth.uid()) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT u.rol INTO v_role
  FROM public.usuarios u
  JOIN auth.users au ON au.id = u.id
  WHERE u.id = auth.uid() AND u.activo IS TRUE
    AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until <= now());
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'active resolved role required' USING ERRCODE = '42501';
  END IF;
  v_docente_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.docente_id ELSE NEW.docente_id END;
  v_cycle_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cuatrimestre_id ELSE NEW.cuatrimestre_id END;
  IF TG_TABLE_NAME = 'observaciones' AND NOT public.can_observe_assigned_teacher(v_docente_id, v_cycle_id) THEN
    RAISE EXCEPTION 'observation assignment required' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'evaluacion_coordinacion' AND NOT public.can_manage_coordinated_teacher(v_docente_id, v_cycle_id) THEN
    RAISE EXCEPTION 'coordinated teacher assignment required' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'planeaciones' AND v_role = 'coordinador'
    AND TG_OP = 'UPDATE' AND NEW.fecha_evaluacion IS DISTINCT FROM OLD.fecha_evaluacion
    AND NOT public.can_manage_coordinated_teacher(v_docente_id, v_cycle_id) THEN
    RAISE EXCEPTION 'coordinated teacher assignment required' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_coordinated_teacher_ids(p_cuatrimestre_id INTEGER)
RETURNS TABLE(docente_id INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF public.is_active_superadmin(auth.uid()) THEN
    RETURN QUERY SELECT d.id FROM public.docentes d WHERE COALESCE(d.activo, true);
  ELSIF public.is_active_coordinator(auth.uid()) THEN
    RETURN QUERY
      SELECT a.docente_id
      FROM public.coordinated_teacher_assignments a
      WHERE a.coordinador_id = auth.uid() AND a.cuatrimestre_id = p_cuatrimestre_id AND a.revoked_at IS NULL;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_observation_teacher_ids(p_cuatrimestre_id INTEGER)
RETURNS TABLE(docente_id INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF public.is_active_superadmin(auth.uid()) THEN
    RETURN QUERY SELECT d.id FROM public.docentes d WHERE COALESCE(d.activo, true);
  ELSIF public.is_active_observation_evaluator(auth.uid()) THEN
    RETURN QUERY
      SELECT a.docente_id
      FROM public.observation_teacher_assignments a
      WHERE a.evaluator_id = auth.uid() AND a.cuatrimestre_id = p_cuatrimestre_id AND a.revoked_at IS NULL;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_observation_allocation_evaluators(p_cuatrimestre_id INTEGER)
RETURNS TABLE(evaluator_id UUID, email TEXT, role TEXT, included BOOLEAN, target_teacher_count INTEGER, current_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'superadmin and valid cycle required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, u.rol, COALESCE(p.included, true), p.target_teacher_count, count(a.id)::BIGINT
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id
      AND au.deleted_at IS NULL
      AND (au.banned_until IS NULL OR au.banned_until <= now())
    LEFT JOIN public.observation_allocation_preferences p
      ON p.evaluator_id = u.id AND p.cuatrimestre_id = p_cuatrimestre_id
    LEFT JOIN public.observation_teacher_assignments a
      ON a.evaluator_id = u.id AND a.cuatrimestre_id = p_cuatrimestre_id AND a.revoked_at IS NULL
    WHERE u.activo IS TRUE AND u.rol IN ('superadmin', 'coordinador', 'observador')
    GROUP BY u.id, u.email, u.rol, p.included, p.target_teacher_count
    ORDER BY CASE u.rol WHEN 'superadmin' THEN 0 WHEN 'coordinador' THEN 1 ELSE 2 END, u.email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_observation_allocation_evaluator_diagnostics(p_cuatrimestre_id INTEGER)
RETURNS TABLE(diagnostic_code TEXT, account_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'superadmin and valid cycle required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT 'eligible_active'::TEXT, count(*)::BIGINT
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id
    WHERE u.activo IS TRUE AND u.rol IN ('superadmin', 'coordinador', 'observador')
      AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until <= now())
    UNION ALL
    SELECT 'inactive_eligible_profile'::TEXT, count(*)::BIGINT
    FROM public.usuarios u
    WHERE u.activo IS NOT TRUE AND u.rol IN ('superadmin', 'coordinador', 'observador')
    UNION ALL
    SELECT 'unresolved_profile'::TEXT, count(*)::BIGINT
    FROM public.usuarios u
    WHERE u.rol = 'pendiente'
    UNION ALL
    SELECT 'auth_account_without_profile'::TEXT, count(*)::BIGINT
    FROM auth.users au
    LEFT JOIN public.usuarios u ON u.id = au.id
    WHERE u.id IS NULL AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until <= now())
    UNION ALL
    SELECT 'profile_without_auth_account'::TEXT, count(*)::BIGINT
    FROM public.usuarios u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE au.id IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_teacher_assignments(
  p_assignment_type TEXT, p_actor_id UUID, p_cuatrimestre_id INTEGER, p_docente_ids INTEGER[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_ids INTEGER[]; v_added INTEGER := 0; v_restored INTEGER := 0;
BEGIN
  IF NOT public.audit_is_superadmin() OR p_assignment_type NOT IN ('coordinated', 'observation')
    OR p_actor_id IS NULL OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_docente_ids IS NULL
    OR cardinality(p_docente_ids) > 500
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid teacher assignment request' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id FOR UPDATE;
  IF (p_assignment_type = 'coordinated' AND NOT public.is_active_coordinator(p_actor_id))
    OR (p_assignment_type = 'observation' AND NOT public.is_active_observation_evaluator(p_actor_id)) THEN
    RAISE EXCEPTION 'actor role is not eligible for assignment type' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::INTEGER[]) INTO v_ids FROM unnest(p_docente_ids) AS x WHERE x > 0;
  IF cardinality(v_ids) <> cardinality(p_docente_ids) OR EXISTS (
    SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.docentes d WHERE d.id = x)
  ) THEN RAISE EXCEPTION 'unique teacher ids required' USING ERRCODE = '22023'; END IF;
  IF p_assignment_type = 'coordinated' THEN
    UPDATE public.coordinated_teacher_assignments SET revoked_at = NULL, revoked_by = NULL
      WHERE coordinador_id = p_actor_id AND cuatrimestre_id = p_cuatrimestre_id AND revoked_at IS NOT NULL AND docente_id = ANY(v_ids);
    GET DIAGNOSTICS v_restored = ROW_COUNT;
    INSERT INTO public.coordinated_teacher_assignments (coordinador_id, docente_id, cuatrimestre_id, assigned_by)
      SELECT p_actor_id, x, p_cuatrimestre_id, auth.uid() FROM unnest(v_ids) x
      WHERE NOT EXISTS (SELECT 1 FROM public.coordinated_teacher_assignments a WHERE a.coordinador_id = p_actor_id AND a.docente_id = x AND a.cuatrimestre_id = p_cuatrimestre_id)
      ON CONFLICT (coordinador_id, docente_id, cuatrimestre_id) WHERE revoked_at IS NULL DO NOTHING;
  ELSE
    UPDATE public.observation_teacher_assignments SET revoked_at = NULL, revoked_by = NULL
      WHERE evaluator_id = p_actor_id AND cuatrimestre_id = p_cuatrimestre_id AND revoked_at IS NOT NULL AND docente_id = ANY(v_ids);
    GET DIAGNOSTICS v_restored = ROW_COUNT;
    INSERT INTO public.observation_teacher_assignments (evaluator_id, docente_id, cuatrimestre_id, assigned_by)
      SELECT p_actor_id, x, p_cuatrimestre_id, auth.uid() FROM unnest(v_ids) x
      WHERE NOT EXISTS (SELECT 1 FROM public.observation_teacher_assignments a WHERE a.evaluator_id = p_actor_id AND a.docente_id = x AND a.cuatrimestre_id = p_cuatrimestre_id)
      ON CONFLICT (evaluator_id, docente_id, cuatrimestre_id) WHERE revoked_at IS NULL DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  PERFORM public.audit_write_event(auth.uid(), 'superadmin', 'admin.assignment', 'teacher_assignment.assigned', NULL,
    'teacher_assignments', jsonb_build_object('cuatrimestre_id', p_cuatrimestre_id, 'assignment_type', p_assignment_type),
    'insert', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('assignment_type', p_assignment_type, 'cuatrimestre_id', p_cuatrimestre_id, 'requested_count', cardinality(v_ids), 'inserted_count', v_added, 'restored_count', v_restored));
  RETURN v_added + v_restored;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_observation_allocation_preferences(
  p_cuatrimestre_id INTEGER, p_preferences JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_item JSONB; v_evaluator_id UUID; v_included BOOLEAN; v_target INTEGER; v_seen UUID[] := ARRAY[]::UUID[]; v_saved INTEGER := 0;
BEGIN
  IF NOT public.audit_is_superadmin() OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR jsonb_typeof(p_preferences) <> 'array' OR jsonb_array_length(p_preferences) > 250
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'invalid allocation preferences' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id FOR UPDATE;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_preferences) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR COALESCE(v_item->>'evaluator_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_item->'included') <> 'boolean'
      OR (v_item ? 'target_teacher_count' AND v_item->'target_teacher_count' <> 'null'::jsonb AND jsonb_typeof(v_item->'target_teacher_count') <> 'number') THEN
      RAISE EXCEPTION 'invalid allocation preference item' USING ERRCODE = '22023';
    END IF;
    v_evaluator_id := (v_item->>'evaluator_id')::UUID;
    v_included := (v_item->>'included')::BOOLEAN;
    v_target := CASE WHEN v_item->'target_teacher_count' IS NULL OR v_item->'target_teacher_count' = 'null'::jsonb THEN NULL ELSE (v_item->>'target_teacher_count')::INTEGER END;
    IF (v_target IS NOT NULL AND v_target NOT BETWEEN 0 AND 10000) OR v_evaluator_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'invalid allocation preference item' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_active_observation_evaluator(v_evaluator_id) THEN
      RAISE EXCEPTION 'active resolved observation evaluator required' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.observation_allocation_preferences (cuatrimestre_id, evaluator_id, included, target_teacher_count, updated_at, updated_by)
      VALUES (p_cuatrimestre_id, v_evaluator_id, v_included, v_target, now(), auth.uid())
      ON CONFLICT (cuatrimestre_id, evaluator_id) DO UPDATE SET included = EXCLUDED.included,
        target_teacher_count = EXCLUDED.target_teacher_count, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    v_seen := array_append(v_seen, v_evaluator_id); v_saved := v_saved + 1;
  END LOOP;
  PERFORM public.audit_write_event(auth.uid(), 'superadmin', 'admin.observation_allocation', 'observation_allocation.preferences_saved', NULL,
    'observation_allocation_preferences', jsonb_build_object('cuatrimestre_id', p_cuatrimestre_id), 'upsert',
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, jsonb_build_object('cuatrimestre_id', p_cuatrimestre_id, 'evaluator_count', v_saved));
  RETURN v_saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_observation_allocation(p_cuatrimestre_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_seed UUID := extensions.gen_random_uuid(); v_fingerprint UUID := extensions.gen_random_uuid(); v_preview_id UUID;
  v_plan JSONB := '{}'::jsonb; v_summary JSONB; v_candidates INTEGER[] := ARRAY[]::INTEGER[];
  v_targeted UUID[] := ARRAY[]::UUID[]; v_untargeted UUID[] := ARRAY[]::UUID[];
  v_evaluator RECORD; v_evaluator_id UUID; v_current INTEGER; v_target INTEGER; v_needed INTEGER;
  v_cursor INTEGER := 0; v_i INTEGER; v_best_id UUID; v_best_load INTEGER; v_load INTEGER; v_best_tie TEXT; v_tie TEXT;
BEGIN
  IF NOT public.audit_is_superadmin() OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'superadmin and valid cycle required' USING ERRCODE = '42501';
  END IF;
  FOR v_evaluator IN
    SELECT u.id, COALESCE(p.included, true) AS included, p.target_teacher_count, count(a.id)::INTEGER AS current_count
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.id AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until <= now())
    LEFT JOIN public.observation_allocation_preferences p ON p.evaluator_id = u.id AND p.cuatrimestre_id = p_cuatrimestre_id
    LEFT JOIN public.observation_teacher_assignments a ON a.evaluator_id = u.id AND a.cuatrimestre_id = p_cuatrimestre_id AND a.revoked_at IS NULL
    WHERE u.activo IS TRUE AND u.rol IN ('superadmin', 'coordinador', 'observador')
    GROUP BY u.id, p.included, p.target_teacher_count
    ORDER BY md5(v_seed::TEXT || ':' || u.id::TEXT)
  LOOP
    v_plan := v_plan || jsonb_build_object(v_evaluator.id::TEXT, jsonb_build_object(
      'included', v_evaluator.included, 'target', v_evaluator.target_teacher_count,
      'current', v_evaluator.current_count, 'proposed_teacher_ids', '[]'::jsonb
    ));
    IF v_evaluator.included THEN
      IF v_evaluator.target_teacher_count IS NULL THEN v_untargeted := array_append(v_untargeted, v_evaluator.id);
      ELSE v_targeted := array_append(v_targeted, v_evaluator.id); END IF;
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg(candidate.docente_id), ARRAY[]::INTEGER[]) INTO v_candidates FROM (
    SELECT d.id AS docente_id FROM public.docentes d
    WHERE d.activo IS TRUE
      AND EXISTS (SELECT 1 FROM public.grupos g WHERE g.docente_id = d.id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.activo IS TRUE)
      AND NOT EXISTS (SELECT 1 FROM public.observation_teacher_assignments a WHERE a.docente_id = d.id AND a.cuatrimestre_id = p_cuatrimestre_id AND a.revoked_at IS NULL)
    ORDER BY md5(v_seed::TEXT || ':' || d.id::TEXT)
  ) candidate;
  FOREACH v_evaluator_id IN ARRAY v_targeted LOOP
    v_current := (v_plan -> v_evaluator_id::TEXT ->> 'current')::INTEGER;
    v_target := (v_plan -> v_evaluator_id::TEXT ->> 'target')::INTEGER;
    v_needed := greatest(v_target - v_current, 0);
    IF v_needed > 0 THEN
      FOR v_i IN 1..least(v_needed, cardinality(v_candidates) - v_cursor) LOOP
        v_cursor := v_cursor + 1;
        v_plan := jsonb_set(v_plan, ARRAY[v_evaluator_id::TEXT, 'proposed_teacher_ids'], (v_plan -> v_evaluator_id::TEXT -> 'proposed_teacher_ids') || jsonb_build_array(v_candidates[v_cursor]), true);
      END LOOP;
    END IF;
  END LOOP;
  WHILE v_cursor < cardinality(v_candidates) AND cardinality(v_untargeted) > 0 LOOP
    v_best_id := NULL; v_best_load := NULL; v_best_tie := NULL;
    FOREACH v_evaluator_id IN ARRAY v_untargeted LOOP
      v_load := (v_plan -> v_evaluator_id::TEXT ->> 'current')::INTEGER + jsonb_array_length(v_plan -> v_evaluator_id::TEXT -> 'proposed_teacher_ids');
      v_tie := md5(v_seed::TEXT || ':' || v_candidates[v_cursor + 1]::TEXT || ':' || v_evaluator_id::TEXT);
      IF v_best_id IS NULL OR v_load < v_best_load OR (v_load = v_best_load AND v_tie < v_best_tie) THEN
        v_best_id := v_evaluator_id; v_best_load := v_load; v_best_tie := v_tie;
      END IF;
    END LOOP;
    v_cursor := v_cursor + 1;
    v_plan := jsonb_set(v_plan, ARRAY[v_best_id::TEXT, 'proposed_teacher_ids'], (v_plan -> v_best_id::TEXT -> 'proposed_teacher_ids') || jsonb_build_array(v_candidates[v_cursor]), true);
  END LOOP;
  SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object(
    'included', value -> 'included', 'current', (value ->> 'current')::INTEGER, 'target', value -> 'target',
    'proposed', jsonb_array_length(value -> 'proposed_teacher_ids'), 'final', (value ->> 'current')::INTEGER + jsonb_array_length(value -> 'proposed_teacher_ids'),
    'exceeds_target', value -> 'target' <> 'null'::jsonb AND (value ->> 'current')::INTEGER > (value ->> 'target')::INTEGER,
    'target_shortfall', value -> 'target' <> 'null'::jsonb AND (value ->> 'current')::INTEGER + jsonb_array_length(value -> 'proposed_teacher_ids') < (value ->> 'target')::INTEGER
  )), '{}'::jsonb) INTO v_summary FROM jsonb_each(v_plan);
  INSERT INTO public.observation_allocation_previews (cuatrimestre_id, seed, fingerprint, created_by, expires_at, proposal, summary)
    VALUES (p_cuatrimestre_id, v_seed, v_fingerprint, auth.uid(), now() + interval '15 minutes', v_plan, v_summary)
    RETURNING id INTO v_preview_id;
  PERFORM public.audit_write_event(auth.uid(), 'superadmin', 'admin.observation_allocation', 'observation_allocation.previewed', NULL,
    'observation_allocation_previews', jsonb_build_object('cuatrimestre_id', p_cuatrimestre_id), 'insert',
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, jsonb_build_object('cuatrimestre_id', p_cuatrimestre_id, 'candidate_count', cardinality(v_candidates), 'proposed_count', v_cursor, 'included_evaluator_count', cardinality(v_targeted) + cardinality(v_untargeted)));
  RETURN jsonb_build_object('preview_id', v_preview_id, 'fingerprint', v_fingerprint, 'seed', v_seed, 'candidate_count', cardinality(v_candidates), 'evaluator_counts', v_summary);
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_observation_allocation(p_cuatrimestre_id INTEGER, p_preview_id UUID, p_fingerprint UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_preview public.observation_allocation_previews%ROWTYPE; v_run public.observation_allocation_runs%ROWTYPE;
  v_item RECORD; v_evaluator_id UUID; v_included BOOLEAN; v_target INTEGER; v_current INTEGER; v_expected_current INTEGER;
  v_planned INTEGER := 0; v_inserted INTEGER := 0; v_row_count INTEGER; v_teacher_id INTEGER; v_has_preference BOOLEAN;
BEGIN
  IF NOT public.audit_is_superadmin() OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_preview_id IS NULL OR p_fingerprint IS NULL THEN
    RAISE EXCEPTION 'superadmin and preview required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_preview FROM public.observation_allocation_previews
    WHERE id = p_preview_id AND cuatrimestre_id = p_cuatrimestre_id AND fingerprint = p_fingerprint AND created_by = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation preview not found' USING ERRCODE = '22023'; END IF;
  IF v_preview.confirmed_at IS NOT NULL THEN
    SELECT * INTO v_run FROM public.observation_allocation_runs WHERE preview_id = v_preview.id;
    RETURN jsonb_build_object('run_id', v_run.id, 'already_confirmed', true, 'assigned_count', COALESCE((v_run.counts ->> 'assigned_count')::INTEGER, 0), 'evaluator_counts', v_preview.summary);
  END IF;
  IF v_preview.expires_at <= now() THEN RAISE EXCEPTION 'allocation preview expired' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.cuatrimestres c WHERE c.id = v_preview.cuatrimestre_id FOR UPDATE;
  FOR v_item IN SELECT key, value FROM jsonb_each(v_preview.proposal) LOOP
    v_evaluator_id := v_item.key::UUID;
    v_included := (v_item.value ->> 'included')::BOOLEAN;
    v_target := CASE WHEN v_item.value -> 'target' = 'null'::jsonb THEN NULL ELSE (v_item.value ->> 'target')::INTEGER END;
    v_expected_current := (v_item.value ->> 'current')::INTEGER;
    SELECT count(*)::INTEGER INTO v_current FROM public.observation_teacher_assignments a
      WHERE a.evaluator_id = v_evaluator_id AND a.cuatrimestre_id = v_preview.cuatrimestre_id AND a.revoked_at IS NULL;
    SELECT EXISTS (
      SELECT 1 FROM public.observation_allocation_preferences p
      WHERE p.evaluator_id = v_evaluator_id AND p.cuatrimestre_id = v_preview.cuatrimestre_id
    ) INTO v_has_preference;
    IF v_current <> v_expected_current OR NOT public.is_active_observation_evaluator(v_evaluator_id) OR (v_has_preference AND NOT EXISTS (
      SELECT 1 FROM public.observation_allocation_preferences p
      WHERE p.evaluator_id = v_evaluator_id AND p.cuatrimestre_id = v_preview.cuatrimestre_id
        AND p.included = v_included AND p.target_teacher_count IS NOT DISTINCT FROM v_target
    )) THEN
      RAISE EXCEPTION 'allocation preview is stale' USING ERRCODE = '40001';
    END IF;
    FOR v_teacher_id IN SELECT value::TEXT::INTEGER FROM jsonb_array_elements(v_item.value -> 'proposed_teacher_ids') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.docentes d WHERE d.id = v_teacher_id AND d.activo IS TRUE
          AND EXISTS (SELECT 1 FROM public.grupos g WHERE g.docente_id = d.id AND g.cuatrimestre_id = v_preview.cuatrimestre_id AND g.activo IS TRUE)
      ) OR EXISTS (
        SELECT 1 FROM public.observation_teacher_assignments a WHERE a.docente_id = v_teacher_id AND a.cuatrimestre_id = v_preview.cuatrimestre_id AND a.revoked_at IS NULL
      ) THEN RAISE EXCEPTION 'allocation preview is stale' USING ERRCODE = '40001'; END IF;
      v_planned := v_planned + 1;
      INSERT INTO public.observation_teacher_assignments (evaluator_id, docente_id, cuatrimestre_id, assigned_by, source)
        VALUES (v_evaluator_id, v_teacher_id, v_preview.cuatrimestre_id, auth.uid(), 'automatic_allocation')
        ON CONFLICT (evaluator_id, docente_id, cuatrimestre_id) WHERE revoked_at IS NULL DO NOTHING;
      GET DIAGNOSTICS v_row_count = ROW_COUNT; v_inserted := v_inserted + v_row_count;
    END LOOP;
  END LOOP;
  IF v_inserted <> v_planned THEN RAISE EXCEPTION 'allocation preview is stale' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.observation_allocation_runs (preview_id, cuatrimestre_id, seed, initiated_by, counts)
    VALUES (v_preview.id, v_preview.cuatrimestre_id, v_preview.seed, auth.uid(), jsonb_build_object('assigned_count', v_inserted, 'evaluator_counts', v_preview.summary))
    RETURNING * INTO v_run;
  UPDATE public.observation_allocation_previews SET confirmed_at = now(), confirmed_by = auth.uid() WHERE id = v_preview.id;
  PERFORM public.audit_write_event(auth.uid(), 'superadmin', 'admin.observation_allocation', 'observation_allocation.confirmed', NULL,
    'observation_allocation_runs', jsonb_build_object('cuatrimestre_id', v_preview.cuatrimestre_id), 'insert',
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, jsonb_build_object('cuatrimestre_id', v_preview.cuatrimestre_id, 'assigned_count', v_inserted));
  RETURN jsonb_build_object('run_id', v_run.id, 'already_confirmed', false, 'assigned_count', v_inserted, 'evaluator_counts', v_preview.summary);
END;
$function$;

REVOKE ALL ON FUNCTION public.is_active_superadmin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_coordinator(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_observation_evaluator(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_observation_allocation_evaluator_diagnostics(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_observation_allocation_evaluator_diagnostics(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
