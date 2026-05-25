-- 004: Encuesta Estudiantil simplificada (10 promedios desde Saeko CSV)
DROP TABLE IF EXISTS encuesta_estudiantil CASCADE;
CREATE TABLE encuesta_estudiantil (
  id SERIAL PRIMARY KEY,
  docente_id INT REFERENCES docentes(id),
  grupo_id INT REFERENCES grupos(id),
  asignatura_id INT REFERENCES asignaturas(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  ciclo VARCHAR(10),
  total_respuestas INT DEFAULT 0,
  prom_asistencia DECIMAL(3,2), prom_organizacion DECIMAL(3,2),
  prom_actitud DECIMAL(3,2), prom_ensenanza DECIMAL(3,2),
  prom_dominio DECIMAL(3,2), prom_evaluacion DECIMAL(3,2),
  prom_comunicacion DECIMAL(3,2), prom_gestion DECIMAL(3,2),
  prom_tecnologia DECIMAL(3,2), prom_satisfaccion DECIMAL(3,2),
  promedio_general DECIMAL(4,2),
  score_normalizado DECIMAL(5,2) GENERATED ALWAYS AS (promedio_general * 20) STORED,
  comentarios TEXT,
  fecha_registro DATE,
  UNIQUE(docente_id, asignatura_id, grupo_id, ciclo)
);
ALTER TABLE encuesta_estudiantil ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura encuestas" ON encuesta_estudiantil FOR SELECT USING (true);
CREATE POLICY "Admin inserta encuestas" ON encuesta_estudiantil FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) = 'superadmin');
