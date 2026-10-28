-- Fourth review state for student comments: "sin aporte" (the comment adds nothing, e.g. "ninguno" or
-- "todo bien"). Like "no autorizado" it is never shown to the teacher, which keeps reading only
-- comentario_validado = TRUE. At most one review flag can be set on a comment.
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD COLUMN IF NOT EXISTS comentario_sin_aporte BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.encuesta_estudiantil_respuestas
  DROP CONSTRAINT IF EXISTS encuesta_estudiantil_comentario_revision_chk;
ALTER TABLE public.encuesta_estudiantil_respuestas
  ADD CONSTRAINT encuesta_estudiantil_comentario_revision_chk
  CHECK (
    (CASE WHEN comentario_validado THEN 1 ELSE 0 END)
    + (CASE WHEN comentario_no_autorizado THEN 1 ELSE 0 END)
    + (CASE WHEN comentario_sin_aporte THEN 1 ELSE 0 END) <= 1
  );

COMMENT ON COLUMN public.encuesta_estudiantil_respuestas.comentario_sin_aporte IS
  'TRUE when a superadmin reviewed comentario_abierto and marked it as adding nothing; it is never shown to the teacher.';

NOTIFY pgrst, 'reload schema';
