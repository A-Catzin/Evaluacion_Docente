-- Detached, empty real-assignment registry; no activation, mapping, or access policy.
-- Individual foreign keys do not establish a current assignment tuple. A future
-- authorized RPC must recheck cycle/group/teacher/subject and enrollment on every read/write.
CREATE TABLE public.student_cd07_real_assignment_manifest (
  cuatrimestre_id INTEGER NOT NULL REFERENCES public.cuatrimestres(id),
  grupo_id INTEGER NOT NULL REFERENCES public.grupos(id),
  docente_id INTEGER NOT NULL REFERENCES public.docentes(id),
  asignatura_id INTEGER NOT NULL REFERENCES public.asignaturas(id),
  instrument_code TEXT NOT NULL DEFAULT 'SED-360-INST-EST-CD-07-V1.1' CHECK (instrument_code = 'SED-360-INST-EST-CD-07-V1.1'),
  assignment_revision TEXT NOT NULL CHECK (char_length(assignment_revision) BETWEEN 1 AND 120 AND btrim(assignment_revision) <> ''),
  is_active BOOLEAN NOT NULL DEFAULT false,
  approval_reference TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  PRIMARY KEY (cuatrimestre_id, grupo_id),
  CONSTRAINT cd07_real_activation_provenance CHECK (NOT is_active OR (approval_reference IS NOT NULL AND btrim(approval_reference) <> '' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND btrim(approved_by) <> ''))
);

ALTER TABLE public.student_cd07_real_assignment_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_cd07_real_assignment_manifest FROM PUBLIC, anon, authenticated, service_role;
