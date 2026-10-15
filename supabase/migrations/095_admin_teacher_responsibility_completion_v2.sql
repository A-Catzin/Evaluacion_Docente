-- V2 leaves the deployed 094 return signature untouched.
CREATE FUNCTION public.admin_teacher_responsibility_completion_v2(p_cuatrimestre_id INTEGER)
RETURNS TABLE (
  docente_id INTEGER, docente_nombre TEXT, docente_apellidos TEXT, docente_email TEXT,
  coordinators TEXT[], autodiagnostico_completed BOOLEAN,
  autodiagnostico_completed_at TIMESTAMP WITHOUT TIME ZONE,
  planning_status TEXT, planning_subject_count INTEGER, planning_submitted_count INTEGER,
  planning_np_subject_count INTEGER, planning_np_group_count INTEGER, planning_group_count INTEGER,
  planning_last_submitted_at TIMESTAMPTZ, planning_plan_id INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid()
      AND coalesce(u.activo, true) AND u.rol = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'superadmin access required' USING ERRCODE = '42501';
  END IF;
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR NOT EXISTS (
    SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id
  ) THEN
    RAISE EXCEPTION 'valid cycle required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH active_assignments AS (
    SELECT g.id AS grupo_id, g.docente_id,
      public.normalize_planning_subject_name(a.nombre) AS subject_key
    FROM public.grupos g
    JOIN public.asignaturas a ON a.id = g.asignatura_id
    WHERE g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id IS NOT NULL
      AND g.activo IS TRUE AND g.modalidad = 'Escolarizado'
      AND public.normalize_planning_subject_name(a.nombre) <> ''
  ),
  classified_groups AS (
    SELECT aa.*,
      (gnp.grupo_id IS NOT NULL OR psnp.subject_key IS NOT NULL) AS is_np
    FROM active_assignments aa
    LEFT JOIN public.planning_group_np gnp
      ON gnp.grupo_id = aa.grupo_id AND gnp.estado = 'NP'
    LEFT JOIN public.planning_subject_np psnp
      ON psnp.docente_id = aa.docente_id AND psnp.cuatrimestre_id = p_cuatrimestre_id
      AND psnp.subject_key = aa.subject_key AND psnp.estado = 'NP'
  ),
  group_counts AS (
    SELECT cg.docente_id, count(*)::INTEGER AS group_count,
      count(*) FILTER (WHERE cg.is_np)::INTEGER AS np_group_count
    FROM classified_groups cg GROUP BY cg.docente_id
  ),
  eligible_subjects AS (
    SELECT DISTINCT cg.docente_id, cg.subject_key
    FROM classified_groups cg WHERE NOT cg.is_np AND cg.subject_key <> ''
  ),
  submitted_plans AS (
    SELECT DISTINCT ON (p.docente_id, public.normalize_planning_subject_name(a.nombre))
      p.docente_id, public.normalize_planning_subject_name(a.nombre) AS subject_key,
      p.id AS plan_id, COALESCE(p.first_teacher_submitted_at, p.fecha_subida) AS submitted_at
    FROM public.planeaciones p
    JOIN public.asignaturas a ON a.id = p.asignatura_id
    JOIN eligible_subjects es ON es.docente_id = p.docente_id
      AND es.subject_key = public.normalize_planning_subject_name(a.nombre)
    WHERE p.cuatrimestre_id = p_cuatrimestre_id
      AND COALESCE(p.first_teacher_submitted_at, p.fecha_subida) IS NOT NULL
    ORDER BY p.docente_id, public.normalize_planning_subject_name(a.nombre),
      COALESCE(p.first_teacher_submitted_at, p.fecha_subida) DESC, p.id DESC
  ),
  planning_by_teacher AS (
    SELECT es.docente_id, count(*)::INTEGER AS subject_count,
      count(sp.plan_id)::INTEGER AS submitted_count,
      max(sp.submitted_at) AS last_submitted_at,
      (array_agg(sp.plan_id ORDER BY sp.submitted_at DESC, sp.plan_id DESC)
        FILTER (WHERE sp.plan_id IS NOT NULL))[1]::INTEGER AS plan_id
    FROM eligible_subjects es
    LEFT JOIN submitted_plans sp ON sp.docente_id = es.docente_id AND sp.subject_key = es.subject_key
    GROUP BY es.docente_id
  ),
  np_subjects AS (
    SELECT cg.docente_id, count(DISTINCT cg.subject_key)::INTEGER AS np_subject_count
    FROM classified_groups cg WHERE cg.is_np GROUP BY cg.docente_id
  ),
  coordinators_by_teacher AS (
    SELECT ca.docente_id,
          array_agg(COALESCE(NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''),
            NULLIF(btrim(u.email::TEXT), ''), ca.coordinador_id::TEXT)
            ORDER BY COALESCE(NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''),
              NULLIF(btrim(u.email::TEXT), ''), ca.coordinador_id::TEXT), ca.coordinador_id)::TEXT[] AS names
    FROM public.coordinated_teacher_assignments ca
    JOIN public.usuarios u ON u.id = ca.coordinador_id
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE ca.cuatrimestre_id = p_cuatrimestre_id AND ca.revoked_at IS NULL
          AND u.activo IS TRUE
    GROUP BY ca.docente_id
  ),
  autodiagnostico_by_teacher AS (
    SELECT ad.docente_id, max(ad.fecha_respuesta) AS completed_at,
      (count(*) > 0 AND max(ad.fecha_respuesta) IS NOT NULL) AS completed
    FROM public.autodiagnosticos ad WHERE ad.cuatrimestre_id = p_cuatrimestre_id
    GROUP BY ad.docente_id
  )
  SELECT d.id, coalesce(d.nombre, '')::TEXT, coalesce(d.apellidos, '')::TEXT,
    coalesce(d.email, '')::TEXT, coalesce(cbt.names, ARRAY[]::TEXT[]),
    coalesce(abt.completed, false), abt.completed_at,
    CASE
      WHEN coalesce(gc.group_count, 0) = 0 THEN 'not_applicable'
      WHEN gc.np_group_count = gc.group_count THEN 'np'
      WHEN coalesce(pbt.subject_count, 0) > 0 AND pbt.submitted_count = pbt.subject_count THEN 'complete'
      WHEN coalesce(pbt.submitted_count, 0) > 0 THEN 'partial'
      ELSE 'none'
    END::TEXT,
    coalesce(pbt.subject_count, 0), coalesce(pbt.submitted_count, 0),
    coalesce(ns.np_subject_count, 0), coalesce(gc.np_group_count, 0),
    coalesce(gc.group_count, 0), pbt.last_submitted_at, pbt.plan_id
  FROM public.docentes d
  LEFT JOIN autodiagnostico_by_teacher abt ON abt.docente_id = d.id
  LEFT JOIN planning_by_teacher pbt ON pbt.docente_id = d.id
  LEFT JOIN np_subjects ns ON ns.docente_id = d.id
  LEFT JOIN group_counts gc ON gc.docente_id = d.id
  LEFT JOIN coordinators_by_teacher cbt ON cbt.docente_id = d.id
  WHERE d.activo IS TRUE ORDER BY d.apellidos, d.nombre, d.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_teacher_responsibility_completion_v2(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_teacher_responsibility_completion_v2(INTEGER) TO authenticated;
NOTIFY pgrst, 'reload schema';
