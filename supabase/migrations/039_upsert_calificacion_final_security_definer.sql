-- Migración 039 — Funciones SECURITY DEFINER para escribir en tablas de scoring
-- sin depender de los permisos RLS del usuario que captura el instrumento.

CREATE OR REPLACE FUNCTION public.tomar_snapshot_modalidad(
  p_docente_id INTEGER,
  p_cuatrimestre_id INTEGER,
  p_modalidad TEXT,
  p_fuente TEXT DEFAULT 'primer_score'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.docente_modalidad_historica (
    docente_id,
    cuatrimestre_id,
    modalidad_snapshot,
    fuente
  )
  VALUES (
    p_docente_id,
    p_cuatrimestre_id,
    p_modalidad,
    p_fuente
  )
  ON CONFLICT (docente_id, cuatrimestre_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_calificacion_final(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  INSERT INTO public.calificaciones_finales (
    docente_id,
    cuatrimestre_id,
    modalidad_snapshot,
    score_encuesta_estudiantil,
    score_coordinacion,
    score_planeacion,
    score_observacion,
    score_autoevaluacion,
    calificacion_final,
    categoria_final,
    num_instrumentos_completados,
    num_instrumentos_esperados,
    version_calculo,
    calculada_en
  )
  VALUES (
    (p_payload->>'docente_id')::INTEGER,
    (p_payload->>'cuatrimestre_id')::INTEGER,
    p_payload->>'modalidad_snapshot',
    NULLIF(p_payload->>'score_encuesta_estudiantil', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_coordinacion', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_planeacion', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_observacion', '')::NUMERIC(5,2),
    NULLIF(p_payload->>'score_autoevaluacion', '')::NUMERIC(5,2),
    (p_payload->>'calificacion_final')::NUMERIC(5,2),
    p_payload->>'categoria_final',
    (p_payload->>'num_instrumentos_completados')::INTEGER,
    (p_payload->>'num_instrumentos_esperados')::INTEGER,
    p_payload->>'version_calculo',
    COALESCE((p_payload->>'calculada_en')::TIMESTAMPTZ, NOW())
  )
  ON CONFLICT (docente_id, cuatrimestre_id)
  DO UPDATE SET
    modalidad_snapshot = EXCLUDED.modalidad_snapshot,
    score_encuesta_estudiantil = EXCLUDED.score_encuesta_estudiantil,
    score_coordinacion = EXCLUDED.score_coordinacion,
    score_planeacion = EXCLUDED.score_planeacion,
    score_observacion = EXCLUDED.score_observacion,
    score_autoevaluacion = EXCLUDED.score_autoevaluacion,
    calificacion_final = EXCLUDED.calificacion_final,
    categoria_final = EXCLUDED.categoria_final,
    num_instrumentos_completados = EXCLUDED.num_instrumentos_completados,
    num_instrumentos_esperados = EXCLUDED.num_instrumentos_esperados,
    version_calculo = EXCLUDED.version_calculo,
    calculada_en = EXCLUDED.calculada_en
  RETURNING to_jsonb(public.calificaciones_finales.*) INTO v_result;

  RETURN v_result;
END;
$function$
;
