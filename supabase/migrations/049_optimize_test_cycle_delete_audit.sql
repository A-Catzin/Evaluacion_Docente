-- Keep audit-chain lookups index-backed and bound audit suppression to the
-- authenticated, validated test-cycle deletion transaction only.

CREATE INDEX IF NOT EXISTS idx_audit_events_integrity_order
  ON public.audit_events (occurred_at DESC, event_id DESC);

-- A random local GUC alone is not an authorization boundary because a caller
-- with arbitrary SQL could set it. This table is writable only by the
-- SECURITY DEFINER deletion RPC and binds the token to one transaction,
-- backend, and authenticated actor. Rows are removed before success and roll
-- back automatically on an error.
CREATE TABLE IF NOT EXISTS public.test_cycle_audit_suppression_context (
  transaction_id BIGINT PRIMARY KEY,
  backend_pid INTEGER NOT NULL,
  actor_id UUID NOT NULL,
  token UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.test_cycle_audit_suppression_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_cycle_audit_suppression_context FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_test_cycle_row_suppression_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token TEXT := current_setting('app.private_test_cycle_delete_audit_token', true);
BEGIN
  IF v_token IS NULL OR v_token = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.test_cycle_audit_suppression_context c
    WHERE c.transaction_id = txid_current()
      AND c.backend_pid = pg_backend_pid()
      AND c.actor_id = auth.uid()
      AND c.token::TEXT = v_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_actor_role TEXT;
  v_changed JSONB := '[]'::jsonb;
BEGIN
  -- Only delete_test_cycle can create the private transaction context below.
  -- This bypasses per-row events, never the durable deletion summary.
  IF public.audit_test_cycle_row_suppression_active() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT u.rol INTO v_actor_role FROM public.usuarios u WHERE u.id = auth.uid();
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO v_changed
      FROM (
        SELECT key
        FROM (
          SELECT key FROM jsonb_object_keys(v_old) AS key
          UNION
          SELECT key FROM jsonb_object_keys(v_new) AS key
        ) keys
        WHERE key NOT IN ('nombre', 'apellidos', 'email', 'correo', 'matricula', 'num_empleado',
          'password', 'password_hash', 'token', 'access_token', 'refresh_token', 'secret',
          'respuesta', 'respuestas', 'comentario', 'comentarios', 'observaciones', 'archivo', 'url',
          'feedback_text', 'improvement_areas', 'titulo', 'mensaje', 'usuario_id',
          'calidad_general', 'item_plan_estudio', 'item_trato_respeto', 'item_asistencia',
          'item_puntualidad', 'item_participacion', 'item_dominio_materia', 'item_plataforma_moodle',
          'item_pensamiento_critico', 'item_desafio_intelectual', 'item_claridad_objetivos',
          'item_lecturas_aprendizaje', 'item_respeto_reglas', 'item_interes_materia',
          'item_apoyos_didacticos', 'item_actitudes_valores', 'item_retroalimentacion',
          'item_criterios_evaluacion', 'item_receptividad', 'comentario_abierto')
          AND v_old->key IS DISTINCT FROM v_new->key
      ) changed;
  END IF;

  PERFORM public.audit_write_event(
    auth.uid(), v_actor_role, 'database.trigger', 'row.' || lower(TG_OP),
    NULLIF(current_setting('app.audit_change_set_id', true), '')::uuid,
    TG_TABLE_NAME, public.audit_record_identity(TG_TABLE_NAME, COALESCE(v_new, v_old)),
    lower(TG_OP), v_changed, public.audit_safe_row(TG_TABLE_NAME, v_old),
    public.audit_safe_row(TG_TABLE_NAME, v_new), jsonb_build_object('kind', 'direct_row_event')
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
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
  v_audit_suppression_token UUID;
  v_tables TEXT[] := ARRAY[
    'autodiagnosticos', 'autoevaluacion_docente', 'calificacion_final_docente',
    'calificaciones_finales', 'coordinador_docentes', 'docente_360_feedback',
    'docente_modalidad_historica', 'encuesta_control_envio', 'encuesta_estudiantil',
    'encuesta_estudiantil_respuestas', 'evaluacion_coordinacion', 'evaluacion_planeacion',
    'grupos', 'import_issues', 'import_runs', 'inscripciones',
    'institutional_notices', 'observacion_clase', 'observaciones', 'planeaciones'
  ];
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_cycle FROM public.cuatrimestres WHERE id = p_cuatrimestre_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'test cycle not found' USING ERRCODE = 'TC005'; END IF;
  PERFORM public.test_cycle_assert_deletable(v_cycle, p_confirmation);
  PERFORM public.test_cycle_assert_known_dependencies();

  -- Queue only verified managed storage references before their rows are removed.
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
  -- This insert occurs before the local context exists, so it is always the
  -- one retained, non-PII audit event if and only if this transaction commits.
  PERFORM public.audit_write_event(
    auth.uid(), v_role, 'admin.test_cycle', 'test_cycle.deleted', NULL,
    'cuatrimestres', jsonb_build_object('cycle_id', v_cycle.id), 'delete', '[]'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('cycle_id', v_cycle.id, 'cycle_label', public.test_cycle_label(v_cycle),
      'operational_counts', v_counts, 'audit_events_retained', true)
  );

  -- set_config(..., true) is transaction-local. The private context row makes
  -- that setting non-forgeable by callers and is removed before return.
  v_audit_suppression_token := extensions.gen_random_uuid();
  PERFORM set_config('app.private_test_cycle_delete_audit_token', v_audit_suppression_token::TEXT, true);
  INSERT INTO public.test_cycle_audit_suppression_context (transaction_id, backend_pid, actor_id, token)
  VALUES (txid_current(), pg_backend_pid(), auth.uid(), v_audit_suppression_token);

  -- Delete children before parents. Every call uses the scoped predicate checked
  -- above; the optional legacy relations are skipped only when absent.
  PERFORM public.test_cycle_delete_rows('import_issues', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('encuesta_estudiantil_respuestas', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('encuesta_control_envio', v_cycle.id);
  IF to_regclass('public.encuesta_estudiantil') IS NOT NULL THEN
    PERFORM public.test_cycle_delete_rows('encuesta_estudiantil', v_cycle.id);
  END IF;
  PERFORM public.test_cycle_delete_rows('evaluacion_planeacion', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('observacion_clase', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('autoevaluacion_docente', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('evaluacion_coordinacion', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('observaciones', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('planeaciones', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('autodiagnosticos', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('docente_360_feedback', v_cycle.id);
  IF to_regclass('public.calificacion_final_docente') IS NOT NULL THEN
    PERFORM public.test_cycle_delete_rows('calificacion_final_docente', v_cycle.id);
  END IF;
  PERFORM public.test_cycle_delete_rows('calificaciones_finales', v_cycle.id);
  IF to_regclass('public.docente_modalidad_historica') IS NOT NULL THEN
    PERFORM public.test_cycle_delete_rows('docente_modalidad_historica', v_cycle.id);
  END IF;
  PERFORM public.test_cycle_delete_rows('institutional_notices', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('inscripciones', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('coordinador_docentes', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('import_runs', v_cycle.id);
  PERFORM public.test_cycle_delete_rows('grupos', v_cycle.id);
  DELETE FROM public.cuatrimestres WHERE id = v_cycle.id;

  DELETE FROM public.test_cycle_audit_suppression_context
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND actor_id = auth.uid()
    AND token = v_audit_suppression_token;
  PERFORM set_config('app.private_test_cycle_delete_audit_token', '', true);

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

REVOKE ALL ON FUNCTION public.audit_test_cycle_row_suppression_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_test_cycle(INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
