-- 007: Fix RLS + UNIQUE + función rol_usuario
-- Recrear función helper por si el DROP CASCADE la borró
CREATE OR REPLACE FUNCTION public.rol_usuario(uid uuid)
RETURNS VARCHAR(20) LANGUAGE sql SECURITY DEFINER
AS $$ SELECT rol FROM public.usuarios WHERE id = uid; $$;

DROP POLICY IF EXISTS "Admin inserta encuestas" ON encuesta_estudiantil;
DROP POLICY IF EXISTS "Lectura encuestas" ON encuesta_estudiantil;
CREATE POLICY "Admin inserta encuestas" ON encuesta_estudiantil FOR INSERT WITH CHECK (true);
CREATE POLICY "Lectura encuestas" ON encuesta_estudiantil FOR SELECT USING (true);

-- Quitar UNIQUE problemático (grupo_id=NULL causaba duplicados)
ALTER TABLE encuesta_estudiantil DROP CONSTRAINT IF EXISTS encuesta_estudiantil_docente_id_asignatura_id_grupo_id_c_key;
ALTER TABLE encuesta_estudiantil ADD UNIQUE(docente_id, asignatura_id, ciclo);
