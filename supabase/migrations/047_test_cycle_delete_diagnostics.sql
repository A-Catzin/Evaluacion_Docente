-- Keep 046 immutable. This forward migration gives the API stable, safe error
-- categories while preserving its exact-confirmation and dependency safeguards.

CREATE OR REPLACE FUNCTION public.test_cycle_assert_deletable(
  p_cycle public.cuatrimestres,
  p_confirmation TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
BEGIN
  IF p_cycle.activo THEN
    RAISE EXCEPTION 'test cycle is active' USING ERRCODE = 'TC001';
  END IF;
  IF NOT p_cycle.es_prueba THEN
    RAISE EXCEPTION 'test cycle is not marked as test' USING ERRCODE = 'TC002';
  END IF;
  IF p_confirmation IS NOT NULL
    AND p_confirmation IS DISTINCT FROM public.test_cycle_label(p_cycle) THEN
    RAISE EXCEPTION 'cycle confirmation does not match' USING ERRCODE = 'TC003';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.test_cycle_assert_known_dependencies()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_unknown TEXT;
  v_unscoped TEXT;
  v_allowed TEXT[] := ARRAY[
    'grupos', 'inscripciones', 'coordinador_docentes',
    'encuesta_control_envio', 'encuesta_estudiantil_respuestas', 'encuesta_estudiantil',
    'evaluacion_coordinacion', 'evaluacion_planeacion', 'observacion_clase',
    'autoevaluacion_docente', 'observaciones', 'planeaciones', 'autodiagnosticos',
    'docente_360_feedback', 'calificaciones_finales', 'docente_modalidad_historica',
    'notificaciones', 'institutional_notices', 'import_runs', 'import_issues'
  ];
BEGIN
  WITH RECURSIVE dependencies(relid) AS (
    SELECT 'public.cuatrimestres'::regclass::oid
    UNION
    SELECT con.conrelid
    FROM pg_catalog.pg_constraint con
    JOIN dependencies d ON d.relid = con.confrelid
    WHERE con.contype = 'f'
  ), tables AS (
    SELECT DISTINCT c.oid, c.relname
    FROM dependencies d
    JOIN pg_catalog.pg_class c ON c.oid = d.relid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname <> 'cuatrimestres'
  )
  SELECT string_agg(relname, ', ' ORDER BY relname)
    INTO v_unknown
    FROM tables
    WHERE NOT (relname = ANY(v_allowed));

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'test cycle dependency guard blocked deletion' USING ERRCODE = 'TC004';
  END IF;

  WITH RECURSIVE dependencies(relid) AS (
    SELECT 'public.cuatrimestres'::regclass::oid
    UNION
    SELECT con.conrelid
    FROM pg_catalog.pg_constraint con
    JOIN dependencies d ON d.relid = con.confrelid
    WHERE con.contype = 'f'
  )
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_unscoped
    FROM dependencies d
    JOIN pg_catalog.pg_class c ON c.oid = d.relid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'cuatrimestres'
      AND public.test_cycle_scope_predicate(c.relname) IS NULL;

  IF v_unscoped IS NOT NULL THEN
    RAISE EXCEPTION 'test cycle dependency guard blocked deletion' USING ERRCODE = 'TC004';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.test_cycle_deletion_preview(p_cuatrimestre_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cycle public.cuatrimestres%ROWTYPE;
  v_table TEXT;
  v_counts JSONB := '{}'::jsonb;
  v_tables TEXT[] := ARRAY[
    'grupos', 'inscripciones', 'coordinador_docentes',
    'encuesta_control_envio', 'encuesta_estudiantil_respuestas', 'encuesta_estudiantil',
    'evaluacion_coordinacion', 'evaluacion_planeacion', 'observacion_clase',
    'autoevaluacion_docente', 'observaciones', 'planeaciones', 'autodiagnosticos',
    'docente_360_feedback', 'calificaciones_finales', 'docente_modalidad_historica',
    'notificaciones', 'institutional_notices', 'import_runs', 'import_issues'
  ];
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  PERFORM public.test_cycle_assert_deletable(v_cycle);
  PERFORM public.test_cycle_assert_known_dependencies();
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      v_counts := v_counts || jsonb_build_object(v_table, public.test_cycle_count_rows(v_table, p_cuatrimestre_id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'cycle_id', v_cycle.id,
    'cycle_label', public.test_cycle_label(v_cycle),
    'counts', v_counts,
    'audit_events_retained', true,
    'storage_cleanup_pending', (
      SELECT count(*) FROM public.test_cycle_storage_cleanup s
      WHERE s.deleted_cycle_id = p_cuatrimestre_id AND s.status = 'pending'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_test_cycle(p_cuatrimestre_id INTEGER, p_confirmation TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_cycle public.cuatrimestres%ROWTYPE;
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  IF v_cycle.activo THEN RAISE EXCEPTION 'test cycle is active' USING ERRCODE = 'TC001'; END IF;
  IF p_confirmation IS DISTINCT FROM public.test_cycle_label(v_cycle) THEN
    RAISE EXCEPTION 'cycle confirmation does not match' USING ERRCODE = 'TC003';
  END IF;
  UPDATE public.cuatrimestres SET es_prueba = true WHERE id = v_cycle.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_test_cycle(p_cuatrimestre_id INTEGER, p_confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cycle public.cuatrimestres%ROWTYPE;
  v_table TEXT;
  v_counts JSONB := '{}'::jsonb;
  v_role TEXT;
  v_tables TEXT[] := ARRAY[
    'import_issues', 'encuesta_estudiantil_respuestas', 'encuesta_control_envio', 'encuesta_estudiantil',
    'evaluacion_planeacion', 'observacion_clase', 'autoevaluacion_docente', 'evaluacion_coordinacion',
    'observaciones', 'planeaciones', 'autodiagnosticos', 'docente_360_feedback',
    'calificaciones_finales', 'docente_modalidad_historica', 'notificaciones',
    'institutional_notices', 'inscripciones', 'coordinador_docentes', 'import_runs', 'grupos'
  ];
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  PERFORM public.test_cycle_assert_deletable(v_cycle, p_confirmation);
  PERFORM public.test_cycle_assert_known_dependencies();

  IF to_regclass('public.planeaciones') IS NOT NULL THEN
    INSERT INTO public.test_cycle_storage_cleanup (deleted_cycle_id, cycle_label, bucket, object_reference, reference_kind)
    SELECT v_cycle.id, public.test_cycle_label(v_cycle), 'planeaciones', p.url_pdf, 'url'
    FROM public.planeaciones p
    WHERE p.cuatrimestre_id = v_cycle.id AND NULLIF(trim(COALESCE(p.url_pdf, '')), '') IS NOT NULL
    ON CONFLICT (deleted_cycle_id, bucket, object_reference) DO NOTHING;
  END IF;
  IF to_regclass('public.institutional_notices') IS NOT NULL THEN
    INSERT INTO public.test_cycle_storage_cleanup (deleted_cycle_id, cycle_label, bucket, object_reference, reference_kind)
    SELECT v_cycle.id, public.test_cycle_label(v_cycle), 'avisos', n.image_path, 'path'
    FROM public.institutional_notices n
    WHERE n.cuatrimestre_id = v_cycle.id AND n.image_path IS NOT NULL
    ON CONFLICT (deleted_cycle_id, bucket, object_reference) DO NOTHING;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      v_counts := v_counts || jsonb_build_object(v_table, public.test_cycle_count_rows(v_table, v_cycle.id));
    END IF;
  END LOOP;
  SELECT u.rol INTO v_role FROM public.usuarios u WHERE u.id = auth.uid();
  PERFORM public.audit_write_event(
    auth.uid(), v_role, 'admin.test_cycle', 'test_cycle.deletion_requested', NULL,
    'cuatrimestres', jsonb_build_object('cycle_id', v_cycle.id), 'delete', '[]'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('cycle_id', v_cycle.id, 'cycle_label', public.test_cycle_label(v_cycle),
      'operational_counts', v_counts, 'audit_events_retained', true)
  );

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      PERFORM public.test_cycle_delete_rows(v_table, v_cycle.id);
    END IF;
  END LOOP;
  DELETE FROM public.cuatrimestres WHERE id = v_cycle.id;
  PERFORM public.refrescar_resultados_agregados();

  RETURN jsonb_build_object(
    'cycle_id', v_cycle.id,
    'cycle_label', public.test_cycle_label(v_cycle),
    'counts', v_counts,
    'audit_events_retained', true,
    'storage_cleanup_pending', (
      SELECT count(*) FROM public.test_cycle_storage_cleanup s
      WHERE s.deleted_cycle_id = v_cycle.id AND s.status = 'pending'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.test_cycle_assert_deletable(public.cuatrimestres, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cycle_assert_known_dependencies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cycle_deletion_preview(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_test_cycle(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_cycle_deletion_preview(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_test_cycle(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
