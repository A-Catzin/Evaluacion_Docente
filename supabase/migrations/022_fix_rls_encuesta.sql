-- Migración 022: Corregir RLS de encuesta_estudiantil
DROP POLICY IF EXISTS "Estudiante inserta encuesta anónima" ON encuesta_estudiantil;

CREATE POLICY "Estudiante inserta encuesta" ON encuesta_estudiantil
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'estudiante')
  );
