-- Retire the superseded group-document status design.
-- Group NP is now represented by planning_group_np (migration 075).
-- Fail closed if this table has acquired data instead of deleting it silently.
DO $migration$
BEGIN
  IF to_regclass('public.planning_group_document_status') IS NULL THEN
    RETURN;
  END IF;

  LOCK TABLE public.planning_group_document_status IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.planning_group_document_status LIMIT 1) THEN
    RAISE EXCEPTION 'planning_group_document_status must be empty before retirement'
      USING ERRCODE = '55006';
  END IF;
END;
$migration$;

DROP FUNCTION IF EXISTS public.set_planning_group_document_status_bulk(INTEGER, JSONB, TEXT, BOOLEAN);
DROP TABLE IF EXISTS public.planning_group_document_status;

NOTIFY pgrst, 'reload schema';
