-- Superadmin validation of student comments before teachers can read them.
-- Teachers never read encuesta_estudiantil_respuestas directly: the RPC below returns
-- only validated comment text for the caller's own teacher records, with no response,
-- student or score data.

ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD COLUMN IF NOT EXISTS comentario_validado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comentario_validado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comentario_validado_por UUID;

COMMENT ON COLUMN public.encuesta_estudiantil_respuestas.comentario_validado IS
  'TRUE when a superadmin approved comentario_abierto to be shown to the teacher.';

CREATE INDEX IF NOT EXISTS encuesta_estudiantil_comentario_validado_idx
  ON public.encuesta_estudiantil_respuestas (cuatrimestre_id, docente_id)
  WHERE comentario_validado;

CREATE OR REPLACE FUNCTION public.obtener_comentarios_estudiantiles_validados(p_cuatrimestre_id integer)
 RETURNS TABLE(asignatura text, grupo text, comentario text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_cuatrimestre_id IS NULL OR p_cuatrimestre_id <= 0 THEN
    RAISE EXCEPTION 'valid cycle id required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'docente' AND u.activo IS TRUE) THEN
    RAISE EXCEPTION 'teacher role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Same identity links the teacher dashboard trusts: entidad_id and institutional email.
  WITH mis_docentes AS (
    SELECT u.entidad_id AS docente_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.entidad_id IS NOT NULL
    UNION
    SELECT d.id FROM public.usuarios u JOIN public.docentes d ON lower(d.email) = lower(u.email) WHERE u.id = auth.uid()
  )
  SELECT COALESCE(a.nombre, 'Asignatura')::TEXT,
         COALESCE(NULLIF(BTRIM(g.grupo_normalizado), ''), g.clave, 'Grupo')::TEXT,
         r.comentario_abierto::TEXT
  FROM public.encuesta_estudiantil_respuestas r
  JOIN mis_docentes m ON m.docente_id = r.docente_id
  JOIN public.grupos g ON g.id = r.grupo_id
  LEFT JOIN public.asignaturas a ON a.id = g.asignatura_id
  WHERE r.cuatrimestre_id = p_cuatrimestre_id
    AND r.comentario_validado IS TRUE
    AND NULLIF(BTRIM(r.comentario_abierto), '') IS NOT NULL
  -- Hash order within each group so submission order cannot hint at identity.
  ORDER BY 1, 2, md5(r.id::TEXT);
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_comentarios_estudiantiles_validados(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_comentarios_estudiantiles_validados(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
