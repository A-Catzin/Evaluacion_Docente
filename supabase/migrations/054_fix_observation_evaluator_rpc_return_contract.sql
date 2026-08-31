-- 052/053 declared text result columns while selecting legacy varchar profile
-- columns without casts. PL/pgSQL RETURN QUERY requires the declared RPC
-- contract, so PostgreSQL can reject the whole evaluator list with 42804.

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
    SELECT
      u.id::UUID,
      u.email::TEXT,
      u.rol::TEXT,
      COALESCE(p.included, true)::BOOLEAN,
      p.target_teacher_count::INTEGER,
      count(a.id)::BIGINT
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

REVOKE ALL ON FUNCTION public.admin_observation_allocation_evaluators(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_observation_allocation_evaluators(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
