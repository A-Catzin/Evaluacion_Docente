-- Detached empty fixture gate, not an activation or a source-classification RPC.
-- Future trusted read/write/score RPCs MUST reject unknown or dual-active tuples
-- across this table and the separate real manifest; independent checks cannot enforce it.
CREATE TABLE public.student_cd07_fixture_authorization (
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  grupo_id INTEGER NOT NULL REFERENCES public.grupos(id),
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  asignatura_id INTEGER NOT NULL REFERENCES public.asignaturas(id),
  instrument_code TEXT NOT NULL CHECK (instrument_code = 'SED-360-INST-EST-CD-07-V1.1'),
  assignment_revision TEXT NOT NULL CHECK (char_length(assignment_revision) BETWEEN 1 AND 120 AND btrim(assignment_revision) <> ''),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  approval_reference TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  PRIMARY KEY (cuatrimestre_id, grupo_id),
  CONSTRAINT cd07_fixture_activation_provenance CHECK (
    NOT is_enabled OR (approval_reference IS NOT NULL AND btrim(approval_reference) <> ''
      AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND btrim(approved_by) <> '')
  )
);

ALTER TABLE public.student_cd07_fixture_authorization ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_cd07_fixture_authorization FROM PUBLIC, anon, authenticated, service_role;
