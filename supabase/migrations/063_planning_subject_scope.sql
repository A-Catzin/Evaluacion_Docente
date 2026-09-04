-- A planning document covers every active group a teacher teaches under the same
-- normalized subject name in a cycle. Keep grupo as the canonical assignment for
-- compatibility with existing review and correction workflows.
ALTER TABLE public.planeaciones
  ADD COLUMN IF NOT EXISTS grupos_cubiertos TEXT[];

-- This data backfill touches planeaciones outside an authenticated request.
-- The legacy staff-assignment trigger intentionally rejects auth.uid() IS NULL,
-- so suspend only that trigger for this transactional migration backfill.
ALTER TABLE public.planeaciones
  DISABLE TRIGGER enforce_planning_assignment_authorization;

UPDATE public.planeaciones
SET grupos_cubiertos = ARRAY[grupo]
WHERE grupos_cubiertos IS NULL;

ALTER TABLE public.planeaciones
  ENABLE TRIGGER enforce_planning_assignment_authorization;

NOTIFY pgrst, 'reload schema';
