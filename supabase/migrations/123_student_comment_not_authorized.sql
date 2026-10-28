-- Third review state for student comments: pending (default), validated (shown to the teacher)
-- and "no autorizado" (reviewed and rejected, never shown). Teachers keep reading only
-- comentario_validado = TRUE through obtener_comentarios_estudiantiles_validados, so
-- this column does not change what any teacher sees.
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD COLUMN IF NOT EXISTS comentario_no_autorizado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.encuesta_estudiantil_respuestas
  DROP CONSTRAINT IF EXISTS encuesta_estudiantil_comentario_revision_chk;
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD CONSTRAINT encuesta_estudiantil_comentario_revision_chk
  CHECK (NOT (comentario_validado AND comentario_no_autorizado));

COMMENT ON COLUMN public.encuesta_estudiantil_respuestas.comentario_no_autorizado IS
  'TRUE when a superadmin reviewed comentario_abierto and rejected it; it is never shown to the teacher.';

NOTIFY pgrst, 'reload schema';
