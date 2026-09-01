-- Versioned instruments are additive. Legacy captures remain their original
-- records and are never transformed into N/A or recalculated by this schema.

CREATE TABLE public.instrument_definitions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('coordination', 'planning', 'observation_escolarizado', 'observation_virtual', 'observation_ejecutivo')),
  purpose TEXT NOT NULL CHECK (purpose IN ('coordination', 'planning', 'observation')),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_versions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES public.instrument_definitions(id),
  version TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  scale_metadata JSONB NOT NULL,
  scoring_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  UNIQUE (definition_id, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX instrument_versions_one_active_per_definition
  ON public.instrument_versions(definition_id)
  WHERE status = 'active' AND effective_to IS NULL;

CREATE TABLE public.instrument_sections (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.instrument_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  scored BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (version_id, code),
  UNIQUE (version_id, position)
);

CREATE TABLE public.instrument_items (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.instrument_versions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.instrument_sections(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  guidance TEXT,
  position INTEGER NOT NULL CHECK (position > 0),
  scored BOOLEAN NOT NULL DEFAULT true,
  na_eligible BOOLEAN NOT NULL DEFAULT false,
  na_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (version_id, code),
  UNIQUE (section_id, position),
  CHECK ((NOT na_eligible) OR scored)
);

CREATE TABLE public.instrument_administrative_checks (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.instrument_versions(id) ON DELETE CASCADE,
  section_code TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  na_eligible BOOLEAN NOT NULL DEFAULT true,
  applicability_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (version_id, code),
  UNIQUE (version_id, position)
);

CREATE TABLE public.instrument_submissions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.instrument_versions(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('coordination', 'planning', 'observation')),
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  submitted_by UUID NOT NULL REFERENCES public.usuarios(id),
  source_record_id INTEGER,
  asignatura_id INTEGER REFERENCES public.asignaturas(id),
  grupo TEXT,
  validity_status TEXT NOT NULL CHECK (validity_status IN ('valid', 'invalid_excessive_na')),
  raw_score NUMERIC(7,3),
  normalized_score NUMERIC(5,2),
  na_count INTEGER NOT NULL DEFAULT 0 CHECK (na_count >= 0),
  applicable_item_count INTEGER NOT NULL DEFAULT 0 CHECK (applicable_item_count >= 0),
  definition_snapshot JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((validity_status = 'valid' AND normalized_score IS NOT NULL) OR (validity_status = 'invalid_excessive_na' AND normalized_score IS NULL)),
  CHECK (purpose <> 'planning' OR source_record_id IS NOT NULL)
);

CREATE UNIQUE INDEX instrument_submissions_one_coordination_capture
  ON public.instrument_submissions(docente_id, cuatrimestre_id, purpose, version_id)
  WHERE purpose = 'coordination';
CREATE UNIQUE INDEX instrument_submissions_one_planning_capture
  ON public.instrument_submissions(source_record_id, version_id)
  WHERE purpose = 'planning';
CREATE UNIQUE INDEX instrument_submissions_one_observation_capture
  ON public.instrument_submissions(docente_id, cuatrimestre_id, purpose, version_id)
  WHERE purpose = 'observation';
CREATE INDEX instrument_submissions_cycle_teacher_idx
  ON public.instrument_submissions(cuatrimestre_id, docente_id, purpose, submitted_at DESC);

CREATE TABLE public.instrument_answers (
  submission_id UUID NOT NULL REFERENCES public.instrument_submissions(id) ON DELETE CASCADE,
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  item_id UUID NOT NULL REFERENCES public.instrument_items(id),
  numeric_value NUMERIC(7,3),
  is_na BOOLEAN NOT NULL DEFAULT false,
  na_reason TEXT,
  PRIMARY KEY (submission_id, item_id),
  CHECK ((is_na AND numeric_value IS NULL AND NULLIF(trim(COALESCE(na_reason, '')), '') IS NOT NULL)
    OR (NOT is_na AND numeric_value IS NOT NULL AND na_reason IS NULL))
);

CREATE TABLE public.instrument_evidence (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.instrument_submissions(id) ON DELETE CASCADE,
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  section_id UUID NOT NULL REFERENCES public.instrument_sections(id),
  evidence TEXT NOT NULL CHECK (NULLIF(trim(evidence), '') IS NOT NULL),
  UNIQUE (submission_id, section_id)
);

CREATE TABLE public.instrument_administrative_check_answers (
  submission_id UUID NOT NULL REFERENCES public.instrument_submissions(id) ON DELETE CASCADE,
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  check_id UUID NOT NULL REFERENCES public.instrument_administrative_checks(id),
  value TEXT NOT NULL CHECK (value IN ('complies', 'does_not_comply', 'na')),
  na_reason TEXT,
  PRIMARY KEY (submission_id, check_id),
  CHECK ((value = 'na' AND NULLIF(trim(COALESCE(na_reason, '')), '') IS NOT NULL)
    OR (value <> 'na' AND na_reason IS NULL))
);

ALTER TABLE public.instrument_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_administrative_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_administrative_check_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instrument_definitions, public.instrument_versions, public.instrument_sections,
  public.instrument_items, public.instrument_administrative_checks, public.instrument_submissions,
  public.instrument_answers, public.instrument_evidence, public.instrument_administrative_check_answers
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.instrument_definition_snapshot(p_version_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'version_id', v.id, 'definition_code', d.code, 'purpose', d.purpose, 'title', d.title,
    'version', v.version, 'effective_from', v.effective_from,
    'scale', v.scale_metadata, 'scoring', v.scoring_metadata,
    'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'code', s.code, 'title', s.title, 'position', s.position, 'scored', s.scored,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'code', i.code, 'label', i.label, 'guidance', i.guidance,
        'position', i.position, 'scored', i.scored, 'na_eligible', i.na_eligible,
        'na_policy', i.na_policy) ORDER BY i.position) FROM public.instrument_items i WHERE i.section_id = s.id), '[]'::jsonb)
    ) ORDER BY s.position) FROM public.instrument_sections s WHERE s.version_id = v.id), '[]'::jsonb),
    'administrative_checks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'section_code', c.section_code, 'code', c.code, 'label', c.label,
      'position', c.position, 'na_eligible', c.na_eligible, 'applicability_policy', c.applicability_policy
    ) ORDER BY c.position) FROM public.instrument_administrative_checks c WHERE c.version_id = v.id), '[]'::jsonb)
  )
  FROM public.instrument_versions v
  JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE v.id = p_version_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_instrument_definition(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_version_id UUID;
BEGIN
  IF p_code NOT IN ('coordination', 'planning', 'observation_escolarizado', 'observation_virtual', 'observation_ejecutivo') THEN
    RAISE EXCEPTION 'valid instrument code required' USING ERRCODE = '22023';
  END IF;
  SELECT v.id INTO v_version_id
  FROM public.instrument_versions v JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE d.code = p_code AND v.status = 'active' AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now())
  ORDER BY v.effective_from DESC LIMIT 1;
  IF v_version_id IS NULL THEN RAISE EXCEPTION 'active instrument version unavailable' USING ERRCODE = 'P0002'; END IF;
  RETURN public.instrument_definition_snapshot(v_version_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.instrument_submission_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF public.audit_test_cycle_row_suppression_active() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'submitted instruments are immutable' USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER instrument_submissions_immutable_trigger
BEFORE UPDATE OR DELETE ON public.instrument_submissions
FOR EACH ROW EXECUTE FUNCTION public.instrument_submission_immutable();
CREATE TRIGGER instrument_answers_immutable_trigger
BEFORE UPDATE OR DELETE ON public.instrument_answers
FOR EACH ROW EXECUTE FUNCTION public.instrument_submission_immutable();
CREATE TRIGGER instrument_evidence_immutable_trigger
BEFORE UPDATE OR DELETE ON public.instrument_evidence
FOR EACH ROW EXECUTE FUNCTION public.instrument_submission_immutable();
CREATE TRIGGER instrument_checks_immutable_trigger
BEFORE UPDATE OR DELETE ON public.instrument_administrative_check_answers
FOR EACH ROW EXECUTE FUNCTION public.instrument_submission_immutable();

REVOKE ALL ON FUNCTION public.instrument_definition_snapshot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_instrument_definition(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.instrument_submission_immutable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_instrument_definition(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
