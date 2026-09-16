-- Per-cycle teacher self-evaluation submission windows. Missing configuration fails
-- closed for teacher inserts while historical rows and non-teacher writes remain intact.
CREATE TABLE public.autodiagnostico_submission_windows (
  cuatrimestre_id INTEGER PRIMARY KEY REFERENCES public.cuatrimestres(id),
  mode TEXT NOT NULL CHECK (mode IN ('manual_open', 'manual_closed', 'scheduled')),
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.usuarios(id),
  updated_by UUID NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (mode = 'scheduled' AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
    OR (mode IN ('manual_open', 'manual_closed') AND opens_at IS NULL AND closes_at IS NULL)
  )
);

ALTER TABLE public.autodiagnostico_submission_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.autodiagnostico_submission_windows FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_effective_state(p_cuatrimestre_id INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_window public.autodiagnostico_submission_windows%ROWTYPE;
BEGIN
  SELECT * INTO v_window
  FROM public.autodiagnostico_submission_windows
  WHERE cuatrimestre_id = p_cuatrimestre_id;

  IF NOT FOUND THEN RETURN 'not_configured'; END IF;
  IF v_window.mode = 'manual_open' THEN RETURN 'open'; END IF;
  IF v_window.mode = 'manual_closed' THEN RETURN 'closed'; END IF;
  IF now() < v_window.opens_at THEN RETURN 'scheduled_pending'; END IF;
  IF now() >= v_window.closes_at THEN RETURN 'scheduled_ended'; END IF;
  RETURN 'open';
END;
$function$;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_is_open(p_cuatrimestre_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.autodiagnostico_submission_window_effective_state(p_cuatrimestre_id) = 'open';
$function$;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_state(p_cuatrimestre_id INTEGER)
RETURNS TABLE(configured BOOLEAN, mode TEXT, opens_at TIMESTAMPTZ, closes_at TIMESTAMPTZ, state TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role TEXT;
BEGIN
  SELECT u.rol INTO v_role FROM public.usuarios u
  WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
  IF COALESCE(v_role, '') NOT IN ('superadmin', 'coordinador', 'docente', 'pendiente')
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'authorized role and valid cycle required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT w.cuatrimestre_id IS NOT NULL, w.mode, w.opens_at, w.closes_at,
    public.autodiagnostico_submission_window_effective_state(p_cuatrimestre_id)
  FROM (SELECT p_cuatrimestre_id AS cuatrimestre_id) requested
  LEFT JOIN public.autodiagnostico_submission_windows w ON w.cuatrimestre_id = requested.cuatrimestre_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_admin_state(p_cuatrimestre_id INTEGER)
RETURNS TABLE(configured BOOLEAN, mode TEXT, opens_at TIMESTAMPTZ, closes_at TIMESTAMPTZ, state TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.autodiagnostico_submission_window_state(p_cuatrimestre_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_admin_list()
RETURNS TABLE(cuatrimestre_id INTEGER, mode TEXT, opens_at TIMESTAMPTZ, closes_at TIMESTAMPTZ, state TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT w.cuatrimestre_id, w.mode, w.opens_at, w.closes_at,
    public.autodiagnostico_submission_window_effective_state(w.cuatrimestre_id)
  FROM public.autodiagnostico_submission_windows w
  ORDER BY w.cuatrimestre_id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.autodiagnostico_submission_window_save(
  p_cuatrimestre_id INTEGER, p_mode TEXT, p_opens_at TIMESTAMPTZ, p_closes_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id)
    OR p_mode NOT IN ('manual_open', 'manual_closed', 'scheduled')
    OR (p_mode = 'scheduled' AND (p_opens_at IS NULL OR p_closes_at IS NULL OR p_opens_at >= p_closes_at))
    OR (p_mode IN ('manual_open', 'manual_closed') AND (p_opens_at IS NOT NULL OR p_closes_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid autodiagnostico submission window' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.autodiagnostico_submission_windows (cuatrimestre_id, mode, opens_at, closes_at, created_by, updated_by)
  VALUES (p_cuatrimestre_id, p_mode, p_opens_at, p_closes_at, auth.uid(), auth.uid())
  ON CONFLICT (cuatrimestre_id) DO UPDATE SET mode = EXCLUDED.mode, opens_at = EXCLUDED.opens_at,
    closes_at = EXCLUDED.closes_at, updated_by = auth.uid(), updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_autodiagnostico_submission_window_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_role TEXT;
BEGIN
  IF public.audit_test_cycle_row_suppression_active() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = auth.uid();
  PERFORM public.audit_write_event(
    auth.uid(), v_role, 'database.trigger', 'autodiagnostico_submission_window.' || lower(TG_OP),
    NULL, 'autodiagnostico_submission_windows', jsonb_build_object('cuatrimestre_id', v_row->'cuatrimestre_id'), lower(TG_OP),
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('cuatrimestre_id', v_row->'cuatrimestre_id', 'mode', v_row->'mode',
      'has_open_at', v_row->>'opens_at' IS NOT NULL, 'has_close_at', v_row->>'closes_at' IS NOT NULL)
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE TRIGGER audit_autodiagnostico_submission_window_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.autodiagnostico_submission_windows
FOR EACH ROW EXECUTE FUNCTION public.audit_autodiagnostico_submission_window_change();

-- This intentionally applies only to new teacher inserts. It does not rewrite or
-- reject historical rows, and leaves coordinator/superadmin service writes alone.
CREATE OR REPLACE FUNCTION public.enforce_teacher_autodiagnostico_submission_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role TEXT;
BEGIN
  SELECT u.rol INTO v_role FROM public.usuarios u
  WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
  IF auth.uid() IS NOT NULL AND v_role IS NULL THEN
    RAISE EXCEPTION 'active user profile required' USING ERRCODE = '42501';
  END IF;
  IF v_role IS DISTINCT FROM 'docente' THEN
    RETURN NEW;
  END IF;
  IF NOT public.autodiagnostico_submission_window_is_open(NEW.cuatrimestre_id) THEN
    RAISE EXCEPTION 'autodiagnostico submissions are closed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_teacher_autodiagnostico_submission_window_trigger ON public.autodiagnosticos;
CREATE TRIGGER enforce_teacher_autodiagnostico_submission_window_trigger
BEFORE INSERT ON public.autodiagnosticos
FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_autodiagnostico_submission_window();

-- Extend the current explicit test-cycle dependency closure, preview, and cleanup
-- without weakening its audit-suppression safeguards.
CREATE OR REPLACE FUNCTION public.test_cycle_assert_known_dependencies()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
    DECLARE v_unknown TEXT; v_unscoped TEXT;
      v_allowed TEXT[] := ARRAY[
        'autodiagnostico_submission_windows', 'autodiagnosticos', 'autoevaluacion_docente', 'calificacion_final_docente',
        'calificaciones_finales', 'coordinador_docentes', 'coordinated_teacher_assignments', 'observation_teacher_assignments', 'teacher_assignment_backfill_review',
        'docente_360_feedback', 'docente_modalidad_historica', 'encuesta_control_envio', 'encuesta_estudiantil', 'encuesta_estudiantil_respuestas',
        'evaluacion_coordinacion', 'evaluacion_planeacion', 'grupos', 'import_issues', 'import_runs', 'inscripciones', 'institutional_notices',
        'instrument_submissions', 'instrument_answers', 'instrument_evidence', 'instrument_administrative_check_answers',
        'observation_allocation_preferences', 'observation_allocation_previews', 'observation_allocation_runs',
        'observacion_clase', 'observaciones', 'planeaciones', 'planning_group_document_status', 'planning_group_np', 'planning_subject_np',
        'planning_submission_windows'
      ];

BEGIN
  WITH RECURSIVE dependencies(relid) AS (
    SELECT 'public.cuatrimestres'::regclass::oid UNION
    SELECT con.conrelid FROM pg_catalog.pg_constraint con JOIN dependencies d ON d.relid = con.confrelid WHERE con.contype = 'f'
  ), tables AS (
    SELECT DISTINCT c.oid, c.relname FROM dependencies d JOIN pg_catalog.pg_class c ON c.oid = d.relid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname <> 'cuatrimestres'
  ) SELECT string_agg(relname, ', ' ORDER BY relname) INTO v_unknown FROM tables WHERE NOT (relname = ANY(v_allowed));
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'test cycle dependency guard blocked deletion' USING ERRCODE = 'TC004'; END IF;
  WITH RECURSIVE dependencies(relid) AS (
    SELECT 'public.cuatrimestres'::regclass::oid UNION
    SELECT con.conrelid FROM pg_catalog.pg_constraint con JOIN dependencies d ON d.relid = con.confrelid WHERE con.contype = 'f'
  ) SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_unscoped
    FROM dependencies d JOIN pg_catalog.pg_class c ON c.oid = d.relid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname <> 'cuatrimestres' AND public.test_cycle_scope_predicate(c.relname) IS NULL;
  IF v_unscoped IS NOT NULL THEN RAISE EXCEPTION 'test cycle dependency guard blocked deletion' USING ERRCODE = 'TC004'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.test_cycle_deletion_preview(p_cuatrimestre_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    DECLARE v_cycle public.cuatrimestres%ROWTYPE; v_table TEXT; v_counts JSONB := '{}'::jsonb;
      v_tables TEXT[] := ARRAY[
        'autodiagnostico_submission_windows', 'autodiagnosticos', 'autoevaluacion_docente', 'calificacion_final_docente', 'calificaciones_finales',
        'coordinador_docentes', 'coordinated_teacher_assignments', 'observation_teacher_assignments', 'teacher_assignment_backfill_review',
        'docente_360_feedback', 'docente_modalidad_historica', 'encuesta_control_envio', 'encuesta_estudiantil', 'encuesta_estudiantil_respuestas',
        'evaluacion_coordinacion', 'evaluacion_planeacion', 'grupos', 'import_issues', 'import_runs', 'inscripciones', 'institutional_notices',
        'instrument_submissions', 'instrument_answers', 'instrument_evidence', 'instrument_administrative_check_answers',
        'observation_allocation_preferences', 'observation_allocation_previews', 'observation_allocation_runs',
        'observacion_clase', 'observaciones', 'planeaciones', 'planning_group_document_status', 'planning_group_np', 'planning_subject_np',
        'planning_submission_windows'
      ];

BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  PERFORM public.test_cycle_assert_deletable(v_cycle); PERFORM public.test_cycle_assert_known_dependencies();
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN v_counts := v_counts || jsonb_build_object(v_table, public.test_cycle_count_rows(v_table, p_cuatrimestre_id)); END IF;
  END LOOP;
  RETURN jsonb_build_object('cycle_id', v_cycle.id, 'cycle_label', public.test_cycle_label(v_cycle), 'counts', v_counts,
    'audit_events_retained', true, 'storage_cleanup_pending', (SELECT count(*) FROM public.test_cycle_storage_cleanup s WHERE s.deleted_cycle_id = p_cuatrimestre_id AND s.status = 'pending'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_test_cycle(p_cuatrimestre_id INTEGER, p_confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
    DECLARE v_cycle public.cuatrimestres%ROWTYPE; v_table TEXT; v_counts JSONB := '{}'::jsonb; v_role TEXT; v_audit_suppression_token UUID;
      v_tables TEXT[] := ARRAY[
        'autodiagnostico_submission_windows', 'autodiagnosticos', 'autoevaluacion_docente', 'calificacion_final_docente', 'calificaciones_finales',
        'coordinador_docentes', 'coordinated_teacher_assignments', 'observation_teacher_assignments', 'teacher_assignment_backfill_review',
        'docente_360_feedback', 'docente_modalidad_historica', 'encuesta_control_envio', 'encuesta_estudiantil', 'encuesta_estudiantil_respuestas',
        'evaluacion_coordinacion', 'evaluacion_planeacion', 'grupos', 'import_issues', 'import_runs', 'inscripciones', 'institutional_notices',
        'instrument_submissions', 'instrument_answers', 'instrument_evidence', 'instrument_administrative_check_answers',
        'observation_allocation_preferences', 'observation_allocation_previews', 'observation_allocation_runs',
        'observacion_clase', 'observaciones', 'planeaciones', 'planning_group_document_status', 'planning_group_np', 'planning_subject_np',
        'planning_submission_windows'
      ];

BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  PERFORM public.test_cycle_assert_deletable(v_cycle, p_confirmation); PERFORM public.test_cycle_assert_known_dependencies();
  IF to_regclass('public.planeaciones') IS NOT NULL THEN
    INSERT INTO public.test_cycle_storage_cleanup (deleted_cycle_id, cycle_label, bucket, object_reference, reference_kind)
    SELECT v_cycle.id, public.test_cycle_label(v_cycle), 'planeaciones', p.url_pdf, 'url' FROM public.planeaciones p
    WHERE p.cuatrimestre_id = v_cycle.id AND NULLIF(trim(COALESCE(p.url_pdf, '')), '') IS NOT NULL ON CONFLICT (deleted_cycle_id, bucket, object_reference) DO NOTHING;
  END IF;
  IF to_regclass('public.institutional_notices') IS NOT NULL THEN
    INSERT INTO public.test_cycle_storage_cleanup (deleted_cycle_id, cycle_label, bucket, object_reference, reference_kind)
    SELECT v_cycle.id, public.test_cycle_label(v_cycle), 'avisos', n.image_path, 'path' FROM public.institutional_notices n
    WHERE n.cuatrimestre_id = v_cycle.id AND n.image_path IS NOT NULL ON CONFLICT (deleted_cycle_id, bucket, object_reference) DO NOTHING;
  END IF;
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN v_counts := v_counts || jsonb_build_object(v_table, public.test_cycle_count_rows(v_table, v_cycle.id)); END IF;
  END LOOP;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = auth.uid();
  PERFORM public.audit_write_event(auth.uid(), v_role, 'admin.test_cycle', 'test_cycle.deleted', NULL, 'cuatrimestres',
    jsonb_build_object('cycle_id', v_cycle.id), 'delete', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('cycle_id', v_cycle.id, 'cycle_label', public.test_cycle_label(v_cycle), 'operational_counts', v_counts, 'audit_events_retained', true));
  v_audit_suppression_token := extensions.gen_random_uuid();
  PERFORM set_config('app.private_test_cycle_delete_audit_token', v_audit_suppression_token::TEXT, true);
  INSERT INTO public.test_cycle_audit_suppression_context (transaction_id, backend_pid, actor_id, token)
  VALUES (txid_current(), pg_backend_pid(), auth.uid(), v_audit_suppression_token);
  PERFORM public.test_cycle_delete_rows('import_issues', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('encuesta_estudiantil_respuestas', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('encuesta_control_envio', v_cycle.id);
  IF to_regclass('public.encuesta_estudiantil') IS NOT NULL THEN PERFORM public.test_cycle_delete_rows('encuesta_estudiantil', v_cycle.id); END IF;
  PERFORM public.test_cycle_delete_rows('evaluacion_planeacion', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('observacion_clase', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('autoevaluacion_docente', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('instrument_administrative_check_answers', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('instrument_answers', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('instrument_evidence', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('instrument_submissions', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('observation_allocation_preferences', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('observation_allocation_runs', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('observation_allocation_previews', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('planning_subject_np', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('planning_group_document_status', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('planning_group_np', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('evaluacion_coordinacion', v_cycle.id);

  PERFORM public.test_cycle_delete_rows('observaciones', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('planeaciones', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('planning_submission_windows', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('autodiagnostico_submission_windows', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('autodiagnosticos', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('docente_360_feedback', v_cycle.id);
  IF to_regclass('public.calificacion_final_docente') IS NOT NULL THEN PERFORM public.test_cycle_delete_rows('calificacion_final_docente', v_cycle.id); END IF;
  PERFORM public.test_cycle_delete_rows('calificaciones_finales', v_cycle.id);
  IF to_regclass('public.docente_modalidad_historica') IS NOT NULL THEN PERFORM public.test_cycle_delete_rows('docente_modalidad_historica', v_cycle.id); END IF;
      PERFORM public.test_cycle_delete_rows('institutional_notices', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('inscripciones', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('teacher_assignment_backfill_review', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('coordinated_teacher_assignments', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('observation_teacher_assignments', v_cycle.id);
      PERFORM public.test_cycle_delete_rows('coordinador_docentes', v_cycle.id);

  PERFORM public.test_cycle_delete_rows('import_runs', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('grupos', v_cycle.id);
  DELETE FROM public.cuatrimestres WHERE id = v_cycle.id;
  DELETE FROM public.test_cycle_audit_suppression_context WHERE transaction_id = txid_current() AND backend_pid = pg_backend_pid() AND actor_id = auth.uid() AND token = v_audit_suppression_token;
  PERFORM set_config('app.private_test_cycle_delete_audit_token', '', true);
  PERFORM public.refrescar_resultados_agregados();
  RETURN jsonb_build_object('cycle_id', v_cycle.id, 'cycle_label', public.test_cycle_label(v_cycle), 'counts', v_counts,
    'audit_events_retained', true, 'storage_cleanup_pending', (SELECT count(*) FROM public.test_cycle_storage_cleanup s WHERE s.deleted_cycle_id = v_cycle.id AND s.status = 'pending'));
END;
$function$;

REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_effective_state(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_is_open(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_state(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_admin_state(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_admin_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autodiagnostico_submission_window_save(INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_autodiagnostico_submission_window_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_teacher_autodiagnostico_submission_window() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cycle_assert_known_dependencies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cycle_deletion_preview(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autodiagnostico_submission_window_state(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.autodiagnostico_submission_window_admin_state(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.autodiagnostico_submission_window_admin_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.autodiagnostico_submission_window_save(INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_cycle_deletion_preview(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
