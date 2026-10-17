-- Stable ordering for admin_seguimiento_encuestas_estudiantes so the app can read it
-- in ranged blocks: PostgREST caps every response at 1000 rows.

CREATE OR REPLACE FUNCTION public.admin_seguimiento_encuestas_estudiantes(p_cuatrimestre_id integer)
 RETURNS TABLE(
   estudiante_id integer,
   nombre text,
   matricula text,
   email text,
   tiene_cuenta boolean,
   ultimo_acceso timestamptz,
   planes text,
   asignadas integer,
   completadas integer,
   pendientes jsonb
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.audit_is_superadmin() THEN
    RAISE EXCEPTION 'superadmin required' USING ERRCODE = '42501';
  END IF;
  IF p_cuatrimestre_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cuatrimestres c WHERE c.id = p_cuatrimestre_id) THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH elegibles AS (
    SELECT i.estudiante_id, g.id AS grupo_id,
      COALESCE(NULLIF(BTRIM(g.grupo_normalizado), ''), g.clave) AS grupo,
      NULLIF(BTRIM(g.plan_normalizado), '') AS plan,
      a.nombre AS materia,
      BTRIM(concat_ws(' ', d.nombre, d.apellidos)) AS docente,
      (ctl.id IS NOT NULL) AS hecho
    FROM public.inscripciones i
    JOIN public.grupos g ON g.id = i.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id
      AND g.activo IS TRUE AND g.encuesta_estudiantil_habilitada IS TRUE
    JOIN public.docentes d ON d.id = g.docente_id
    JOIN public.asignaturas a ON a.id = g.asignatura_id
    LEFT JOIN public.encuesta_control_envio ctl
      ON ctl.estudiante_id = i.estudiante_id AND ctl.grupo_id = g.id AND ctl.cuatrimestre_id = p_cuatrimestre_id
    WHERE i.cuatrimestre_id = p_cuatrimestre_id
  )
  SELECT e.id,
    BTRIM(concat_ws(' ', e.nombre, e.apellidos))::TEXT,
    e.matricula::TEXT,
    e.email::TEXT,
    (u.id IS NOT NULL),
    u.ultimo_acceso::TIMESTAMPTZ,
    string_agg(DISTINCT el.plan, ' · ')::TEXT,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE el.hecho)::INTEGER,
    COALESCE(
      jsonb_agg(jsonb_build_object('materia', el.materia, 'docente', el.docente, 'grupo', el.grupo)
        ORDER BY el.materia, el.grupo) FILTER (WHERE NOT el.hecho),
      '[]'::jsonb)
  FROM elegibles el
  JOIN public.estudiantes e ON e.id = el.estudiante_id AND e.activo IS TRUE
  LEFT JOIN LATERAL (
    SELECT us.id, us.ultimo_acceso FROM public.usuarios us
    WHERE us.entidad_id = e.id AND us.rol = 'estudiante'
    ORDER BY us.ultimo_acceso DESC NULLS LAST LIMIT 1
  ) u ON TRUE
  GROUP BY e.id, e.nombre, e.apellidos, e.matricula, e.email, u.id, u.ultimo_acceso
  -- e.id breaks ties so ranged reads (blocks of 1000) never skip or repeat a student.
  ORDER BY (COUNT(*) FILTER (WHERE el.hecho)) = COUNT(*), e.apellidos, e.nombre, e.id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
