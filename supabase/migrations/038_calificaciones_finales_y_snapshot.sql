-- Paso 1 — Esquema de snapshot de modalidad histórica y calificaciones finales precalculadas.
-- No incluye la función recalcular_calificacion_final; se define en el Paso 2.

CREATE TABLE IF NOT EXISTS public.docente_modalidad_historica (
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  modalidad_snapshot TEXT NOT NULL,
  fuente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (docente_id, cuatrimestre_id)
);

CREATE TABLE IF NOT EXISTS public.calificaciones_finales (
  id BIGSERIAL PRIMARY KEY,
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  modalidad_snapshot TEXT NOT NULL,
  score_encuesta_estudiantil NUMERIC(5,2),
  score_coordinacion NUMERIC(5,2),
  score_planeacion NUMERIC(5,2),
  score_observacion NUMERIC(5,2),
  score_autoevaluacion NUMERIC(5,2),
  calificacion_final NUMERIC(5,2) NOT NULL,
  categoria_final TEXT NOT NULL,
  num_instrumentos_completados INTEGER NOT NULL,
  num_instrumentos_esperados INTEGER NOT NULL,
  version_calculo TEXT NOT NULL DEFAULT 'v2.1',
  calculada_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (docente_id, cuatrimestre_id)
);

CREATE INDEX IF NOT EXISTS idx_calificaciones_finales_cuatrimestre_id
  ON public.calificaciones_finales(cuatrimestre_id);

DROP MATERIALIZED VIEW IF EXISTS public.resultados_agregados;

CREATE MATERIALIZED VIEW public.resultados_agregados AS
SELECT
  cf.id,
  cf.docente_id,
  cf.cuatrimestre_id,
  cf.modalidad_snapshot,
  cf.score_encuesta_estudiantil,
  cf.score_coordinacion,
  cf.score_planeacion,
  cf.score_observacion,
  cf.score_autoevaluacion,
  cf.calificacion_final,
  cf.categoria_final,
  cf.num_instrumentos_completados,
  cf.num_instrumentos_esperados,
  cf.version_calculo,
  cf.calculada_en,
  d.nombre AS docente_nombre,
  d.apellidos AS docente_apellidos,
  d.email AS docente_email,
  d.campus AS docente_campus
FROM public.calificaciones_finales cf
JOIN public.docentes d ON d.id = cf.docente_id;

CREATE UNIQUE INDEX idx_resultados_agregados_id
  ON public.resultados_agregados(id);

CREATE OR REPLACE FUNCTION public.refrescar_resultados_agregados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Intenta refresco concurrente si existe el índice único requerido.
  -- En el primer despliegue, o si el índice falta, cae al refresco normal.
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.resultados_agregados;
  EXCEPTION
    WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW public.resultados_agregados;
  END;
END;
$function$
;
