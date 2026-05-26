-- Migración 005: Vincular coordinadores con docentes que supervisan
CREATE TABLE IF NOT EXISTS coordinador_docentes (
  coordinador_id UUID REFERENCES usuarios(id),
  docente_id INT REFERENCES docentes(id),
  UNIQUE(coordinador_id, docente_id)
);
ALTER TABLE coordinador_docentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona vinculaciones" ON coordinador_docentes FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');
CREATE POLICY "Coordinador lee sus docentes" ON coordinador_docentes FOR SELECT USING (coordinador_id = auth.uid());
