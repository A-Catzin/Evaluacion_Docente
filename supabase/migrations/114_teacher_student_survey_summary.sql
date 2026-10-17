-- Teacher-facing student survey data is fully anonymous:
-- * validated comments are returned as bare text (no subject or group, which in small
--   groups would let a teacher trace the author);
-- * results are aggregated per instrument across all of the teacher's groups.

DROP FUNCTION IF EXISTS public.obtener_comentarios_estudiantiles_validados(INTEGER);

CREATE FUNCTION public.obtener_comentarios_estudiantiles_validados(p_cuatrimestre_id integer)
 RETURNS TABLE(comentario text)
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
  SELECT r.comentario_abierto::TEXT
  FROM public.encuesta_estudiantil_respuestas r
  JOIN mis_docentes m ON m.docente_id = r.docente_id
  WHERE r.cuatrimestre_id = p_cuatrimestre_id
    AND r.comentario_validado IS TRUE
    AND NULLIF(BTRIM(r.comentario_abierto), '') IS NOT NULL
  -- Hash order so submission order cannot hint at identity.
  ORDER BY md5(r.id::TEXT);
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_evaluacion_estudiantil_docente(p_cuatrimestre_id integer)
 RETURNS TABLE(instrumento text, respuestas bigint, score_normalizado numeric, promedios numeric[])
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
  WITH mis_docentes AS (
    SELECT u.entidad_id AS docente_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.entidad_id IS NOT NULL
    UNION
    SELECT d.id FROM public.usuarios u JOIN public.docentes d ON lower(d.email) = lower(u.email) WHERE u.id = auth.uid()
  ),
  -- Same response set and item order as obtener_scores_encuesta_estudiantil_nativa.
  valores AS (
    SELECT r.id, r.instrumento::TEXT AS instrumento,
      CASE WHEN r.instrumento = 'general-19' THEN ARRAY[
        r.calidad_general, r.item_plan_estudio, r.item_trato_respeto, r.item_asistencia, r.item_puntualidad,
        r.item_participacion, r.item_dominio_materia, r.item_plataforma_moodle, r.item_pensamiento_critico,
        r.item_desafio_intelectual, r.item_claridad_objetivos, r.item_lecturas_aprendizaje, r.item_respeto_reglas,
        r.item_interes_materia, r.item_apoyos_didacticos, r.item_actitudes_valores, r.item_retroalimentacion,
        r.item_criterios_evaluacion, r.item_receptividad]::SMALLINT[]
      ELSE r.respuestas_instrumento END AS vals
    FROM public.encuesta_estudiantil_respuestas r
    JOIN mis_docentes m ON m.docente_id = r.docente_id
    JOIN public.grupos g ON g.id = r.grupo_id AND g.cuatrimestre_id = p_cuatrimestre_id AND g.docente_id = r.docente_id
    WHERE r.cuatrimestre_id = p_cuatrimestre_id
  ),
  validos AS (
    SELECT v.* FROM valores v
    WHERE v.vals IS NOT NULL AND array_position(v.vals, NULL) IS NULL
      AND cardinality(v.vals) = CASE WHEN v.instrumento = 'general-19' THEN 19 ELSE 20 END
      AND 1 <= ALL (v.vals) AND 5 >= ALL (v.vals)
  ),
  totales AS (
    SELECT v.instrumento, COUNT(*)::BIGINT AS respuestas,
      AVG(((SELECT sum(x) FROM unnest(v.vals) x) - cardinality(v.vals))::NUMERIC / (cardinality(v.vals) * 4) * 100) AS score
    FROM validos v GROUP BY v.instrumento
  ),
  reactivos AS (
    SELECT v.instrumento, u.ord, AVG(u.x)::NUMERIC AS promedio
    FROM validos v, unnest(v.vals) WITH ORDINALITY AS u(x, ord)
    GROUP BY v.instrumento, u.ord
  )
  SELECT t.instrumento, t.respuestas, round(t.score, 2),
    (SELECT array_agg(round(rx.promedio, 2) ORDER BY rx.ord) FROM reactivos rx WHERE rx.instrumento = t.instrumento)
  FROM totales t
  ORDER BY (t.instrumento <> 'general-19'), t.instrumento;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_comentarios_estudiantiles_validados(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_comentarios_estudiantiles_validados(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_evaluacion_estudiantil_docente(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_evaluacion_estudiantil_docente(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
