-- Migration 050 is historical and remains unchanged because it is already applied.
-- This migration normalizes deployed data and function behavior to Escolarizado.

DO $migration$
DECLARE
  v_column RECORD;
BEGIN
  FOR v_column IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns AS c
    JOIN information_schema.tables AS t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'character')
      AND c.column_name IN ('modalidad', 'modalidad_snapshot')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      'public', v_column.table_name, v_column.column_name, v_column.column_name
    ) USING 'Escolarizado', 'Escolarizada';
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.enforce_teacher_planning_submission_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role TEXT;
  v_docente_id INTEGER;
  v_plan_docente_id INTEGER;
  v_plan_cuatrimestre_id INTEGER;
  v_plan_asignatura_id INTEGER;
  v_plan_grupo TEXT;
  v_plan_modalidad TEXT;
BEGIN
  SELECT u.rol, u.entidad_id INTO v_role, v_docente_id
  FROM public.usuarios u WHERE u.id = auth.uid() AND COALESCE(u.activo, true);
  IF v_role IS DISTINCT FROM 'docente' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF v_docente_id IS NULL THEN RAISE EXCEPTION 'teacher identity required' USING ERRCODE = '42501'; END IF;

  IF TG_OP = 'DELETE' THEN
    v_plan_docente_id := OLD.docente_id;
    v_plan_cuatrimestre_id := OLD.cuatrimestre_id;
    v_plan_asignatura_id := OLD.asignatura_id;
    v_plan_grupo := OLD.grupo;
    v_plan_modalidad := OLD.modalidad;
  ELSE
    v_plan_docente_id := NEW.docente_id;
    v_plan_cuatrimestre_id := NEW.cuatrimestre_id;
    v_plan_asignatura_id := NEW.asignatura_id;
    v_plan_grupo := NEW.grupo;
    v_plan_modalidad := NEW.modalidad;
  END IF;

  IF v_plan_docente_id IS DISTINCT FROM v_docente_id THEN
    RAISE EXCEPTION 'teacher cannot write another teacher planning' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.docente_id IS DISTINCT FROM OLD.docente_id
    OR NEW.cuatrimestre_id IS DISTINCT FROM OLD.cuatrimestre_id
    OR NEW.asignatura_id IS DISTINCT FROM OLD.asignatura_id
    OR NEW.grupo IS DISTINCT FROM OLD.grupo
    OR NEW.modalidad IS DISTINCT FROM OLD.modalidad) THEN
    RAISE EXCEPTION 'teacher cannot change planning ownership or assignment' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.estado IS DISTINCT FROM 'Pendiente'
    OR NEW.puntaje_promedio IS NOT NULL OR NEW.fecha_evaluacion IS NOT NULL
    OR NEW.comentario_retroalimentacion IS NOT NULL OR NEW.observaciones_generales IS NOT NULL
    OR NEW.evaluacion_detalle IS NOT NULL OR NEW.no_aplica_count IS NOT NULL
    OR NEW.criterio_alineacion IS NOT NULL OR NEW.criterio_secuencia IS NOT NULL
    OR NEW.criterio_recursos IS NOT NULL OR NEW.criterio_evaluacion IS NOT NULL
    OR NEW.comentario_interno IS NOT NULL) THEN
    RAISE EXCEPTION 'teacher cannot create an evaluated planning' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.estado IS DISTINCT FROM 'Pendiente'
    OR NEW.puntaje_promedio IS DISTINCT FROM OLD.puntaje_promedio
    OR NEW.fecha_evaluacion IS DISTINCT FROM OLD.fecha_evaluacion
    OR NEW.comentario_retroalimentacion IS DISTINCT FROM OLD.comentario_retroalimentacion
    OR NEW.observaciones_generales IS DISTINCT FROM OLD.observaciones_generales
    OR NEW.evaluacion_detalle IS DISTINCT FROM OLD.evaluacion_detalle
    OR NEW.no_aplica_count IS DISTINCT FROM OLD.no_aplica_count
    OR NEW.criterio_alineacion IS DISTINCT FROM OLD.criterio_alineacion
    OR NEW.criterio_secuencia IS DISTINCT FROM OLD.criterio_secuencia
    OR NEW.criterio_recursos IS DISTINCT FROM OLD.criterio_recursos
    OR NEW.criterio_evaluacion IS DISTINCT FROM OLD.criterio_evaluacion
    OR NEW.comentario_interno IS DISTINCT FROM OLD.comentario_interno
    OR NEW.fecha_subida IS DISTINCT FROM OLD.fecha_subida) THEN
    RAISE EXCEPTION 'teacher cannot alter planning evaluation' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.grupos g
    WHERE g.docente_id = v_docente_id AND g.cuatrimestre_id = v_plan_cuatrimestre_id
      AND g.asignatura_id = v_plan_asignatura_id AND g.clave = v_plan_grupo
      AND g.modalidad = v_plan_modalidad AND g.modalidad = 'Escolarizado' AND g.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'planning assignment is not owned by teacher in this cycle' USING ERRCODE = '42501';
  END IF;
  IF NOT public.planning_submission_window_is_open(v_plan_cuatrimestre_id) THEN
    RAISE EXCEPTION 'planning submissions are closed' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- Migration 050 created this trigger. Create it only when the historical trigger
-- is absent; replacing the function above is sufficient when it already exists.
DO $trigger$
BEGIN
  IF to_regclass('public.planeaciones') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.planeaciones'::regclass
      AND t.tgname = 'enforce_teacher_planning_submission_window_trigger'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER enforce_teacher_planning_submission_window_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON public.planeaciones
    FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_planning_submission_window();
  END IF;
END;
$trigger$;

REVOKE ALL ON FUNCTION public.enforce_teacher_planning_submission_window() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
