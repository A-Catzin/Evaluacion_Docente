-- Fast-path the already-deployed row audit trigger: authorized assignment-import and
-- test-cycle suppression returns before per-row JSON materialization. This migration
-- is transactional and idempotent; it only replaces the trigger function.
--
-- Operational verification for the separate, manually run migration 082 (read-only):
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname = 'inscripciones_assignment_import_source_idx';

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_actor_role TEXT;
  v_changed JSONB := '[]'::jsonb;
BEGIN
  -- A non-empty local GUC alone is never sufficient. The helper verifies the
  -- private context row created by the authenticated assignment-import RPC, and
  -- this branch is limited to its three high-volume bulk-write relations.
  IF TG_TABLE_NAME IN ('asignaturas', 'grupos', 'inscripciones') THEN
    IF NULLIF(current_setting('app.assignment_import_audit_token', true), '') IS NOT NULL
       AND public.audit_assignment_import_row_suppression_active() THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- Preserve the existing, independently authenticated test-cycle behavior.
  IF public.audit_test_cycle_row_suppression_active() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Both authorized bypasses above return before row JSON is materialized.
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

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
