-- Migración 023: Simplificar RLS de encuesta_estudiantil
DROP POLICY IF EXISTS "Estudiante inserta encuesta anónima" ON encuesta_estudiantil;
DROP POLICY IF EXISTS "Estudiante inserta encuesta" ON encuesta_estudiantil;
DROP POLICY IF EXISTS "Staff y docente leen resultados" ON encuesta_estudiantil;

CREATE POLICY "Insertar encuesta" ON encuesta_estudiantil FOR INSERT WITH CHECK (true);
CREATE POLICY "Leer encuesta" ON encuesta_estudiantil FOR SELECT USING (true);
