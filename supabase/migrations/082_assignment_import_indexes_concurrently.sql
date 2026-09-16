-- Assignment-import performance indexes.
-- MUST RUN OUTSIDE A TRANSACTION: execute each CREATE INDEX CONCURRENTLY statement
-- individually in Supabase SQL Editor, or use a migration runner with transactional
-- DDL disabled. Do not run this file through a runner that wraps migrations.

CREATE INDEX CONCURRENTLY IF NOT EXISTS inscripciones_assignment_import_source_idx
  ON public.inscripciones (grupo_id, cuatrimestre_id);

-- Supports canonical import-key lookups without adding an unsafe unique constraint
-- to historical group rows, which may contain duplicate legacy identities.
CREATE INDEX CONCURRENTLY IF NOT EXISTS grupos_assignment_import_key_idx
  ON public.grupos (cuatrimestre_id, asignatura_id, importacion_key)
  WHERE activo = true AND importacion_key IS NOT NULL;
