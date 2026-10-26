-- Coordination captures get server-side working drafts, like observations.
-- Final submissions stay immutable; drafts live in the same mutable table and are
-- keyed per author, so two coordinators of one teacher never overwrite each other.
CREATE OR REPLACE FUNCTION public.coordination_draft_authorize(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID, p_actor UUID
) RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_actor IS NULL OR p_docente_id IS NULL OR p_docente_id <= 0
    OR p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'valid coordination draft request required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor AND COALESCE(u.activo, true) AND u.rol IN ('superadmin', 'coordinador')
  ) OR NOT public.can_manage_coordinated_teacher(p_docente_id, p_cuatrimestre_id, p_actor)
    OR NOT EXISTS (
      SELECT 1 FROM public.instrument_versions v
      JOIN public.instrument_definitions d ON d.id = v.definition_id
      WHERE v.id = p_version_id AND d.purpose = 'coordination'
    ) THEN
    RAISE EXCEPTION 'coordinated teacher assignment required' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_coordination_instrument_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  PERFORM public.coordination_draft_authorize(p_docente_id, p_cuatrimestre_id, p_version_id, v_actor);
  IF EXISTS (
    SELECT 1 FROM public.instrument_submissions s
    WHERE s.docente_id = p_docente_id AND s.cuatrimestre_id = p_cuatrimestre_id
      AND s.version_id = p_version_id AND s.purpose = 'coordination'
  ) THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object('draft', d.draft, 'updated_at', d.updated_at) INTO v_result
  FROM public.instrument_submission_drafts d
  WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
    AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_coordination_instrument_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID, p_draft JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' OR octet_length(p_draft::TEXT) > 100000 THEN
    RAISE EXCEPTION 'valid coordination draft required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.coordination_draft_authorize(p_docente_id, p_cuatrimestre_id, p_version_id, v_actor);
  IF EXISTS (
    SELECT 1 FROM public.instrument_submissions s
    WHERE s.docente_id = p_docente_id AND s.cuatrimestre_id = p_cuatrimestre_id
      AND s.version_id = p_version_id AND s.purpose = 'coordination'
  ) THEN
    DELETE FROM public.instrument_submission_drafts d
    WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
      AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id;
    RETURN jsonb_build_object('completed', true);
  END IF;
  INSERT INTO public.instrument_submission_drafts AS d (
    submitted_by, docente_id, cuatrimestre_id, version_id, draft, updated_at
  ) VALUES (v_actor, p_docente_id, p_cuatrimestre_id, p_version_id, p_draft, now())
  ON CONFLICT (submitted_by, docente_id, cuatrimestre_id, version_id) DO UPDATE
    SET draft = EXCLUDED.draft, updated_at = now()
  RETURNING jsonb_build_object('draft', d.draft, 'updated_at', d.updated_at) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_coordination_instrument_draft(
  p_docente_id INTEGER, p_cuatrimestre_id INTEGER, p_version_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor UUID := auth.uid();
BEGIN
  PERFORM public.coordination_draft_authorize(p_docente_id, p_cuatrimestre_id, p_version_id, v_actor);
  DELETE FROM public.instrument_submission_drafts d
  WHERE d.submitted_by = v_actor AND d.docente_id = p_docente_id
    AND d.cuatrimestre_id = p_cuatrimestre_id AND d.version_id = p_version_id;
END;
$function$;

-- A final coordination submission discards every pending draft for that teacher/version,
-- exactly as observations already do.
CREATE OR REPLACE FUNCTION public.discard_observation_drafts_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.purpose IN ('observation', 'coordination') THEN
    DELETE FROM public.instrument_submission_drafts d
    WHERE d.docente_id = NEW.docente_id
      AND d.cuatrimestre_id = NEW.cuatrimestre_id
      AND d.version_id = NEW.version_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.coordination_draft_authorize(INTEGER, INTEGER, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_coordination_instrument_draft(INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_coordination_instrument_draft(INTEGER, INTEGER, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_coordination_instrument_draft(INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discard_observation_drafts_on_submission() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coordination_instrument_draft(INTEGER, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_coordination_instrument_draft(INTEGER, INTEGER, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_coordination_instrument_draft(INTEGER, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
