-- 008: Aumentar tamaño de ciclo + desactivar RLS de encuesta
ALTER TABLE encuesta_estudiantil ALTER COLUMN ciclo TYPE VARCHAR(30);

-- Desactivar RLS temporalmente (la API ya valida superadmin)
ALTER TABLE encuesta_estudiantil DISABLE ROW LEVEL SECURITY;
