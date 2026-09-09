-- Applies a validated homogeneous NP operation in one database transaction. The
-- existing single-subject RPC remains the authority for scope, audit, and status
-- transitions, while this wrapper validates the full batch before any write.
CREATE OR REPLACE FUNCTION public.set_planning_subject_np_bulk(
  p_cuatrimestre_id INTEGER,
  p_items JSONB,
  p_motivo TEXT DEFAULT NULL,
  p_mark_np BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_item JSONB;
  v_docente_id INTEGER;
  v_docente_id_text TEXT;
  v_subject_key TEXT;
  v_subject_name TEXT;
  v_signature TEXT;
  v_seen JSONB := '{}'::jsonb;
  v_count INTEGER := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  SELECT u.rol INTO v_role
  FROM public.usuarios u
  WHERE u.id = v_actor AND coalesce(u.activo, true);

  IF v_role <> 'superadmin'
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0
    OR jsonb_array_length(p_items) > 50
    OR length(coalesce(p_motivo, '')) > 500 THEN
    RAISE EXCEPTION 'valid superadmin NP batch request required' USING ERRCODE = '22023';
  END IF;

  -- Validate every item, including its active Escolarizado scope, before invoking
  -- the write RPC. Any exception aborts the whole function transaction.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_count := v_count + 1;
    v_docente_id_text := coalesce(v_item->>'docente_id', '');
    IF jsonb_typeof(v_item) <> 'object'
      OR v_docente_id_text !~ '^[1-9][0-9]*$'
      OR length(v_docente_id_text) > 10
      OR (length(v_docente_id_text) = 10 AND v_docente_id_text > '2147483647')
      OR jsonb_typeof(v_item->'subject_key') <> 'string'
      OR jsonb_typeof(v_item->'subject_name') <> 'string' THEN
      RAISE EXCEPTION 'valid NP batch item required' USING ERRCODE = '22023';
    END IF;

    v_docente_id := v_docente_id_text::INTEGER;
    v_subject_key := public.normalize_planning_subject_name(v_item->>'subject_key');
    v_subject_name := trim(v_item->>'subject_name');
    v_signature := v_docente_id::TEXT || ':' || v_subject_key;

    IF v_subject_key = '' OR v_subject_key IS DISTINCT FROM v_item->>'subject_key'
      OR v_subject_name = '' OR v_seen ? v_signature THEN
      RAISE EXCEPTION 'duplicate or invalid NP batch scope' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || jsonb_build_object(v_signature, true);

    IF NOT EXISTS (
      SELECT 1
      FROM public.grupos g
      JOIN public.asignaturas a ON a.id = g.asignatura_id
      WHERE g.docente_id = v_docente_id
        AND g.cuatrimestre_id = p_cuatrimestre_id
        AND g.activo IS TRUE
        AND g.modalidad = 'Escolarizado'
        AND public.normalize_planning_subject_name(a.nombre) = v_subject_key
    ) THEN
      RAISE EXCEPTION 'assigned subject scope required' USING ERRCODE = '22023';
    END IF;

    IF p_mark_np AND EXISTS (
      SELECT 1
      FROM public.planeaciones p
      JOIN public.asignaturas a ON a.id = p.asignatura_id
      WHERE p.docente_id = v_docente_id
        AND p.cuatrimestre_id = p_cuatrimestre_id
        AND p.estado = 'Aprobado'
        AND public.normalize_planning_subject_name(a.nombre) = v_subject_key
    ) THEN
      RAISE EXCEPTION 'approved planning cannot be marked NP' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_results := v_results || jsonb_build_array(public.set_planning_subject_np(
      (v_item->>'docente_id')::INTEGER,
      p_cuatrimestre_id,
      v_item->>'subject_key',
      v_item->>'subject_name',
      p_motivo,
      p_mark_np
    ));
  END LOOP;

  RETURN v_results;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_planning_subject_np_bulk(INTEGER, JSONB, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_planning_subject_np_bulk(INTEGER, JSONB, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
