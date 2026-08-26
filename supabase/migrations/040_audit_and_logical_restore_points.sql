-- Phase 1 audit and recovery foundation. This migration is intentionally
-- forward-only: the historical baseline migrations are not versioned here.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.change_sets (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'running', 'completed', 'failed')),
  source TEXT NOT NULL,
  operation TEXT NOT NULL,
  actor_id UUID,
  actor_role TEXT,
  cuatrimestre_id INTEGER,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_safe TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.restore_points (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  change_set_id UUID NOT NULL UNIQUE REFERENCES public.change_sets(id),
  status TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'invalid')),
  execution_available BOOLEAN NOT NULL DEFAULT false,
  scope JSONB NOT NULL,
  manifest JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  event_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_role TEXT,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  change_set_id UUID REFERENCES public.change_sets(id),
  table_name TEXT,
  record_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  operation TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_safe JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_safe JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_safe JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_hash TEXT,
  integrity_hash TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON public.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_change_set ON public.audit_events (change_set_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_lookup ON public.audit_events (table_name, operation, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_sets_cuatrimestre ON public.change_sets (cuatrimestre_id, requested_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restore_points ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audit_events, public.change_sets, public.restore_points FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.rol = 'superadmin'
      AND COALESCE(u.activo, true)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_safe_row(p_table_name TEXT, p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
  IF p_row IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Keep only operational state and relation fields. Names, emails, enrolment
  -- identifiers, free text, credentials, answers, and storage paths stay out.
  IF p_table_name = 'estudiantes' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object('activo', p_row->'activo'));
  END IF;
  IF p_table_name = 'inscripciones' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'grupo_id', p_row->'grupo_id',
      'cuatrimestre_id', p_row->'cuatrimestre_id'
    ));
  END IF;
  IF p_table_name = 'notificaciones' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'leida', p_row->'leida',
      'tipo', p_row->'tipo',
      'created_at', p_row->'created_at'
    ));
  END IF;
  IF p_table_name = 'docente_360_feedback' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'docente_id', p_row->'docente_id',
      'cuatrimestre_id', p_row->'cuatrimestre_id',
      'feedback_present', COALESCE(NULLIF(p_row->>'feedback_text', ''), '') <> '',
      'improvement_areas_present', COALESCE(NULLIF(p_row->>'improvement_areas', ''), '') <> '',
      'updated_at', p_row->'updated_at'
    ));
  END IF;
  IF p_table_name = 'planeaciones' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'docente_id', p_row->'docente_id',
      'cuatrimestre_id', p_row->'cuatrimestre_id',
      'asignatura_id', p_row->'asignatura_id',
      'grupo', p_row->'grupo',
      'modalidad', p_row->'modalidad',
      'estado', p_row->'estado',
      'fecha_subida', p_row->'fecha_subida',
      'fecha_evaluacion', p_row->'fecha_evaluacion'
    ));
  END IF;
  IF p_table_name = 'observaciones' THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'docente_id', p_row->'docente_id',
      'cuatrimestre_id', p_row->'cuatrimestre_id',
      'asignatura_id', p_row->'asignatura_id',
      'grupo_id', p_row->'grupo_id_fk',
      'instrument_version', p_row->'instrument_version',
      'fecha_observacion', p_row->'fecha_observacion'
    ));
  END IF;
  IF p_table_name IN ('evaluacion_coordinacion', 'evaluacion_planeacion', 'observacion_clase', 'autoevaluacion_docente') THEN
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'docente_id', p_row->'docente_id',
      'cuatrimestre_id', p_row->'cuatrimestre_id',
      'asignatura_id', p_row->'asignatura_id',
      'grupo_id', p_row->'grupo_id',
      'score_normalizado', p_row->'score_normalizado',
      'categoria', p_row->'categoria',
      'estado', p_row->'estado'
    ));
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', p_row->'id',
    'activo', p_row->'activo',
    'activa', p_row->'activa',
    'estado', p_row->'estado',
    'rol', p_row->'rol',
    'cuatrimestre_id', p_row->'cuatrimestre_id',
    'docente_id', p_row->'docente_id',
    'asignatura_id', p_row->'asignatura_id',
    'grupo_id', p_row->'grupo_id',
    'coordinador_id', p_row->'coordinador_id',
    'observador_id', p_row->'observador_id',
    'calificacion_final', p_row->'calificacion_final',
    'categoria_final', p_row->'categoria_final',
    'num_instrumentos_completados', p_row->'num_instrumentos_completados'
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_record_identity(p_table_name TEXT, p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_id TEXT;
BEGIN
  v_id := COALESCE(
    p_row->>'id',
    concat_ws(':', p_row->>'coordinador_id', p_row->>'docente_id', p_row->>'observador_id',
      p_row->>'estudiante_id', p_row->>'grupo_id', p_row->>'asignatura_id', p_row->>'cuatrimestre_id'),
    'unkeyed'
  );
  IF p_table_name IN ('estudiantes', 'inscripciones') THEN
    RETURN jsonb_build_object(
      'id_hash', encode(extensions.digest(convert_to(p_table_name || ':' || v_id, 'UTF8'), 'sha256'), 'hex')
    );
  END IF;
  IF v_id = '' THEN
    RETURN jsonb_build_object('identity_hash', encode(extensions.digest(convert_to(p_table_name || ':unkeyed', 'UTF8'), 'sha256'), 'hex'));
  END IF;
  RETURN jsonb_build_object('id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_write_event(
  p_actor_id UUID,
  p_actor_role TEXT,
  p_source TEXT,
  p_action TEXT,
  p_change_set_id UUID,
  p_table_name TEXT,
  p_record_identity JSONB,
  p_operation TEXT,
  p_changed_fields JSONB DEFAULT '[]'::jsonb,
  p_before_safe JSONB DEFAULT '{}'::jsonb,
  p_after_safe JSONB DEFAULT '{}'::jsonb,
  p_summary_safe JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.audit_events (
    actor_id, actor_role, source, action, change_set_id, table_name,
    record_identity, operation, changed_fields, before_safe, after_safe, summary_safe
  ) VALUES (
    p_actor_id, p_actor_role, left(p_source, 120), left(p_action, 120), p_change_set_id,
    left(p_table_name, 120), COALESCE(p_record_identity, '{}'::jsonb), left(p_operation, 40),
    COALESCE(p_changed_fields, '[]'::jsonb), COALESCE(p_before_safe, '{}'::jsonb),
    COALESCE(p_after_safe, '{}'::jsonb), COALESCE(p_summary_safe, '{}'::jsonb)
  ) RETURNING event_id INTO v_event_id;
  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_events_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '42501';
  END IF;

  NEW.event_id := COALESCE(NEW.event_id, extensions.gen_random_uuid());
  NEW.occurred_at := COALESCE(NEW.occurred_at, now());
  PERFORM pg_advisory_xact_lock(hashtext('public.audit_events.integrity'));
  SELECT integrity_hash
    INTO NEW.previous_hash
    FROM public.audit_events
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT 1;
  v_payload := concat_ws('|', NEW.previous_hash, NEW.event_id::text, NEW.occurred_at::text,
    NEW.source, NEW.action, NEW.operation, NEW.record_identity::text,
    NEW.changed_fields::text, NEW.before_safe::text, NEW.after_safe::text, NEW.summary_safe::text);
  NEW.integrity_hash := encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE INSERT OR UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.audit_events_integrity();

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

CREATE OR REPLACE FUNCTION public.audit_student_evaluation_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_role TEXT;
  v_target_hash TEXT;
BEGIN
  -- A control row is the completion marker owned by the native submission RPC.
  -- This deferred trigger runs at transaction end, so its event is durable only on commit.
  SELECT u.rol INTO v_actor_role
  FROM public.usuarios u
  WHERE u.id = auth.uid()
    AND COALESCE(u.activo, true);

  IF v_actor_role IS DISTINCT FROM 'estudiante' THEN
    RETURN NEW;
  END IF;

  v_target_hash := encode(extensions.digest(convert_to(
    'student_evaluation:' || COALESCE(NEW.estudiante_id::text, '') || ':' ||
    COALESCE(NEW.grupo_id::text, '') || ':' || COALESCE(NEW.cuatrimestre_id::text, ''),
    'UTF8'
  ), 'sha256'), 'hex');

  PERFORM public.audit_write_event(
    auth.uid(), v_actor_role, 'database.trigger', 'student_evaluation.submitted',
    NULL, 'encuesta_control_envio', jsonb_build_object('protected_target_hash', v_target_hash),
    'insert', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object(
      'kind', 'student_evaluation_submission',
      'cuatrimestre_id', NEW.cuatrimestre_id,
      'grupo_id', NEW.grupo_id
    )
  );
  RETURN NEW;
END;
$function$;

DO $block$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'docentes', 'estudiantes', 'grupos', 'inscripciones', 'asignaturas', 'cuatrimestres',
    'ofertas_academicas', 'coordinador_docentes', 'usuarios', 'instrumento_preguntas',
    'planeaciones', 'evaluacion_coordinacion', 'observaciones', 'autodiagnosticos',
     'calificaciones_finales', 'docente_360_feedback', 'notificaciones',
     'evaluacion_planeacion', 'observacion_clase', 'autoevaluacion_docente'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change_trigger ON public.%I', v_table);
      EXECUTE format('CREATE TRIGGER audit_row_change_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', v_table);
    END IF;
  END LOOP;
END;
$block$;

DO $block$
BEGIN
  IF to_regclass('public.encuesta_control_envio') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_student_evaluation_submitted_trigger ON public.encuesta_control_envio;
    CREATE CONSTRAINT TRIGGER audit_student_evaluation_submitted_trigger
    AFTER INSERT ON public.encuesta_control_envio
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.audit_student_evaluation_submitted();
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.audit_create_change_set(
  p_source TEXT,
  p_operation TEXT,
  p_cuatrimestre_id INTEGER DEFAULT NULL,
  p_scope JSONB DEFAULT '{}'::jsonb,
  p_input_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_role TEXT;
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_source !~ '^admin\.import\.(docentes|alumnos|asignaciones)$'
    OR length(p_operation) > 80
    OR jsonb_typeof(p_scope) <> 'object'
    OR jsonb_typeof(p_input_metadata) <> 'object'
    OR length(p_scope::text) > 20000
    OR length(p_input_metadata::text) > 10000 THEN
    RAISE EXCEPTION 'invalid audit change-set input' USING ERRCODE = '22023';
  END IF;
  IF p_cuatrimestre_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = '22023';
  END IF;
  SELECT rol INTO v_role FROM public.usuarios WHERE id = auth.uid();
  INSERT INTO public.change_sets (source, operation, actor_id, actor_role, cuatrimestre_id, scope, input_metadata)
  VALUES (p_source, left(p_operation, 80), auth.uid(), v_role, p_cuatrimestre_id, p_scope, p_input_metadata)
  RETURNING id INTO v_id;
  PERFORM public.audit_write_event(auth.uid(), v_role, p_source, 'change_set.requested', v_id,
    NULL, '{}'::jsonb, 'change_set', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('kind', 'import_bulk_summary', 'status', 'requested'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_create_restore_point(p_change_set_id UUID, p_manifest JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restore_point_id UUID;
  v_change_set public.change_sets%ROWTYPE;
  v_hash TEXT;
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_manifest) <> 'object' OR jsonb_typeof(p_manifest->'tables') <> 'array'
    OR jsonb_array_length(p_manifest->'tables') > 10 OR length(p_manifest::text) > 100000 THEN
    RAISE EXCEPTION 'invalid bounded restore manifest' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_change_set FROM public.change_sets WHERE id = p_change_set_id FOR UPDATE;
  IF NOT FOUND OR v_change_set.actor_id IS DISTINCT FROM auth.uid() OR v_change_set.status <> 'requested' THEN
    RAISE EXCEPTION 'change set is not available' USING ERRCODE = '42501';
  END IF;
  v_hash := encode(extensions.digest(convert_to(p_manifest::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.restore_points (change_set_id, scope, manifest, content_hash)
  VALUES (p_change_set_id, v_change_set.scope, p_manifest, v_hash)
  RETURNING id INTO v_restore_point_id;
  UPDATE public.change_sets SET status = 'running', started_at = now() WHERE id = p_change_set_id;
  PERFORM public.audit_write_event(auth.uid(), v_change_set.actor_role, v_change_set.source, 'restore_point.captured',
    p_change_set_id, NULL, '{}'::jsonb, 'restore_point', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('kind', 'logical_manifest', 'restore_point_id', v_restore_point_id,
      'content_hash', v_hash, 'execution_available', false));
  RETURN v_restore_point_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_finish_change_set(
  p_change_set_id UUID,
  p_status TEXT,
  p_summary JSONB DEFAULT '{}'::jsonb,
  p_error_safe TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_change_set public.change_sets%ROWTYPE;
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('completed', 'failed') OR jsonb_typeof(p_summary) <> 'object' OR length(p_summary::text) > 20000 THEN
    RAISE EXCEPTION 'invalid change-set completion' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_change_set FROM public.change_sets WHERE id = p_change_set_id FOR UPDATE;
  IF NOT FOUND OR v_change_set.actor_id IS DISTINCT FROM auth.uid() OR v_change_set.status NOT IN ('requested', 'running') THEN
    RAISE EXCEPTION 'change set is not available' USING ERRCODE = '42501';
  END IF;
  UPDATE public.change_sets
  SET status = p_status, summary = p_summary, error_safe = left(NULLIF(p_error_safe, ''), 500), completed_at = now()
  WHERE id = p_change_set_id;
  PERFORM public.audit_write_event(auth.uid(), v_change_set.actor_role, v_change_set.source,
    'change_set.' || p_status, p_change_set_id, NULL, '{}'::jsonb, 'change_set',
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object('kind', 'import_bulk_summary', 'status', p_status, 'summary', p_summary,
      'error_recorded', p_error_safe IS NOT NULL));
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_list_traceability(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_table_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_change_set_id UUID DEFAULT NULL,
  p_cuatrimestre_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID, occurred_at TIMESTAMPTZ, actor_id UUID, actor_role TEXT, source TEXT, action TEXT,
  actor_visibility TEXT,
  table_name TEXT, operation TEXT, change_set_id UUID, change_set_status TEXT, cuatrimestre_id INTEGER,
  restore_point_id UUID, restore_status TEXT, restore_content_hash TEXT, restore_execution_available BOOLEAN,
  summary_safe JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to) THEN
    RAISE EXCEPTION 'invalid traceability filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT e.event_id, e.occurred_at,
    CASE WHEN e.actor_role = 'estudiante' THEN NULL ELSE e.actor_id END,
    e.actor_role, e.source, e.action,
    CASE WHEN e.actor_role = 'estudiante' THEN 'protected' ELSE 'identified' END,
    e.table_name, e.operation, e.change_set_id, cs.status, cs.cuatrimestre_id,
    rp.id, rp.status, rp.content_hash, rp.execution_available, e.summary_safe
  FROM public.audit_events e
  LEFT JOIN public.change_sets cs ON cs.id = e.change_set_id
  LEFT JOIN public.restore_points rp ON rp.change_set_id = e.change_set_id
  WHERE (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at <= p_to)
    AND (p_actor_id IS NULL OR e.actor_id = p_actor_id)
    AND (p_operation IS NULL OR e.operation = p_operation)
    AND (p_table_name IS NULL OR e.table_name = p_table_name)
    AND (p_source IS NULL OR e.source = p_source)
    AND (p_change_set_id IS NULL OR e.change_set_id = p_change_set_id)
    AND (p_cuatrimestre_id IS NULL OR cs.cuatrimestre_id = p_cuatrimestre_id)
  ORDER BY e.occurred_at DESC, e.event_id DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_list_my_activity(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  occurred_at TIMESTAMPTZ,
  actor_role TEXT,
  action TEXT,
  instrument TEXT,
  target_metadata JSONB,
  integrity_hash TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT u.rol
    INTO v_role
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND COALESCE(u.activo, true);

  IF v_role NOT IN ('docente', 'coordinador', 'observador') THEN
    RAISE EXCEPTION 'staff personal activity required' USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 100
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND (
      p_from > p_to OR p_to - p_from > INTERVAL '366 days'
    )) THEN
    RAISE EXCEPTION 'invalid personal activity filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    e.event_id,
    e.occurred_at,
    e.actor_role,
    CASE
      WHEN e.table_name = 'autodiagnosticos' THEN 'Autodiagnóstico enviado'
      WHEN e.table_name = 'planeaciones' AND e.actor_role = 'docente' THEN 'Planeación enviada'
      WHEN e.table_name = 'planeaciones' AND e.operation = 'update' THEN 'Planeación evaluada'
      WHEN e.table_name = 'evaluacion_coordinacion' THEN 'Evaluación de coordinación enviada'
      WHEN e.table_name = 'observaciones' THEN 'Observación de clase enviada'
    END,
    CASE
      WHEN e.table_name = 'autodiagnosticos' THEN 'Autodiagnóstico'
      WHEN e.table_name = 'planeaciones' THEN 'Planeación'
      WHEN e.table_name = 'evaluacion_coordinacion' THEN 'Evaluación de coordinación'
      WHEN e.table_name = 'observaciones' THEN 'Observación de clase'
    END,
    jsonb_strip_nulls(jsonb_build_object(
      'cuatrimestre_id', e.after_safe->'cuatrimestre_id',
      'grupo_id', e.after_safe->'grupo_id',
      'grupo', e.after_safe->'grupo',
      'docente_id', CASE
        WHEN e.table_name IN ('evaluacion_coordinacion', 'observaciones', 'planeaciones')
          THEN e.after_safe->'docente_id'
      END,
      'asignatura_id', e.after_safe->'asignatura_id'
    )),
    e.integrity_hash
  FROM public.audit_events e
  WHERE e.actor_id = auth.uid()
    AND e.actor_id IS NOT NULL
    AND e.actor_role NOT IN ('estudiante', 'pendiente')
    AND e.source = 'database.trigger'
    AND e.action IN ('row.insert', 'row.update')
    AND (
      (v_role = 'docente' AND (
        (e.table_name = 'autodiagnosticos' AND e.operation = 'insert')
        OR (e.table_name = 'planeaciones' AND e.operation IN ('insert', 'update'))
      ))
      OR (v_role = 'coordinador' AND (
        (e.table_name = 'evaluacion_coordinacion' AND e.operation = 'insert')
        OR (e.table_name = 'observaciones' AND e.operation = 'insert')
        OR (e.table_name = 'planeaciones' AND e.operation = 'update')
      ))
      OR (v_role = 'observador' AND e.table_name = 'observaciones' AND e.operation = 'insert')
    )
    AND (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at <= p_to)
  ORDER BY e.occurred_at DESC, e.event_id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_is_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_safe_row(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_record_identity(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_write_event(UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_events_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_student_evaluation_submitted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_create_change_set(TEXT, TEXT, INTEGER, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_create_restore_point(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_finish_change_set(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_list_traceability(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_list_my_activity(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_create_change_set(TEXT, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_create_restore_point(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_finish_change_set(UUID, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_list_traceability(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_list_my_activity(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
