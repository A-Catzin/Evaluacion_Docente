-- Detached additive storage only. No route, RPC, policy or assignment activation.
-- PostgreSQL CHECK accepts UNKNOWN: explicit NOT NULL and null-element rejection
-- prevent a NULL answer or NULL predicate from bypassing the array contract.
CREATE TABLE public.encuesta_estudiantil_cd07_respuestas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  grupo_id INTEGER NOT NULL REFERENCES public.grupos(id),
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  asignatura_id INTEGER NOT NULL REFERENCES public.asignaturas(id),
  instrument_code TEXT NOT NULL CHECK (instrument_code = 'SED-360-INST-EST-CD-07-V1.1'),
  assignment_revision TEXT NOT NULL CHECK (char_length(assignment_revision) BETWEEN 1 AND 120 AND btrim(assignment_revision) <> ''),
  response_origin TEXT NOT NULL CHECK (response_origin IN ('real', 'fixture')),
  respuestas SMALLINT[] NOT NULL,
  comentario_abierto TEXT CHECK (char_length(comentario_abierto) <= 2000),
  capturada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cd07_respuestas_exactas CHECK (
    array_ndims(respuestas) = 1
    AND cardinality(respuestas) = 20
    AND array_position(respuestas, NULL) IS NULL
    AND respuestas <@ ARRAY[1, 2, 3, 4, 5]::SMALLINT[]
  )
);

ALTER TABLE public.encuesta_estudiantil_cd07_respuestas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.encuesta_estudiantil_cd07_respuestas FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.encuesta_estudiantil_cd07_respuestas_id_seq FROM PUBLIC, anon, authenticated, service_role;
