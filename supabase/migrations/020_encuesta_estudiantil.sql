-- =============================================================
-- Migración 020: Encuesta Estudiantil (EE — 35%)
-- 51 reactivos en 10 secciones (A-J), escala Likert 1-5
-- =============================================================

CREATE TABLE encuesta_estudiantil (
  id SERIAL PRIMARY KEY,
  docente_id INT REFERENCES docentes(id),
  grupo_id INT REFERENCES grupos(id),
  asignatura_id INT REFERENCES asignaturas(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  ciclo VARCHAR(10) NOT NULL,
  -- A. Asistencia y Puntualidad (5)
  asi1 SMALLINT CHECK(asi1 BETWEEN 1 AND 5), asi2 SMALLINT CHECK(asi2 BETWEEN 1 AND 5), asi3 SMALLINT CHECK(asi3 BETWEEN 1 AND 5), asi4 SMALLINT CHECK(asi4 BETWEEN 1 AND 5), asi5 SMALLINT CHECK(asi5 BETWEEN 1 AND 5),
  -- B. Organización de la Asignatura (5)
  org1 SMALLINT CHECK(org1 BETWEEN 1 AND 5), org2 SMALLINT CHECK(org2 BETWEEN 1 AND 5), org3 SMALLINT CHECK(org3 BETWEEN 1 AND 5), org4 SMALLINT CHECK(org4 BETWEEN 1 AND 5), org5 SMALLINT CHECK(org5 BETWEEN 1 AND 5),
  -- C. Actitud y Empatía (5)
  act1 SMALLINT CHECK(act1 BETWEEN 1 AND 5), act2 SMALLINT CHECK(act2 BETWEEN 1 AND 5), act3 SMALLINT CHECK(act3 BETWEEN 1 AND 5), act4 SMALLINT CHECK(act4 BETWEEN 1 AND 5), act5 SMALLINT CHECK(act5 BETWEEN 1 AND 5),
  -- D. Estrategias de Enseñanza (6)
  ens1 SMALLINT CHECK(ens1 BETWEEN 1 AND 5), ens2 SMALLINT CHECK(ens2 BETWEEN 1 AND 5), ens3 SMALLINT CHECK(ens3 BETWEEN 1 AND 5), ens4 SMALLINT CHECK(ens4 BETWEEN 1 AND 5), ens5 SMALLINT CHECK(ens5 BETWEEN 1 AND 5), ens6 SMALLINT CHECK(ens6 BETWEEN 1 AND 5),
  -- E. Dominio del Contenido (5)
  dom1 SMALLINT CHECK(dom1 BETWEEN 1 AND 5), dom2 SMALLINT CHECK(dom2 BETWEEN 1 AND 5), dom3 SMALLINT CHECK(dom3 BETWEEN 1 AND 5), dom4 SMALLINT CHECK(dom4 BETWEEN 1 AND 5), dom5 SMALLINT CHECK(dom5 BETWEEN 1 AND 5),
  -- F. Evaluación y Calificación (5)
  eva1 SMALLINT CHECK(eva1 BETWEEN 1 AND 5), eva2 SMALLINT CHECK(eva2 BETWEEN 1 AND 5), eva3 SMALLINT CHECK(eva3 BETWEEN 1 AND 5), eva4 SMALLINT CHECK(eva4 BETWEEN 1 AND 5), eva5 SMALLINT CHECK(eva5 BETWEEN 1 AND 5),
  -- G. Participación y Comunicación (5)
  com1 SMALLINT CHECK(com1 BETWEEN 1 AND 5), com2 SMALLINT CHECK(com2 BETWEEN 1 AND 5), com3 SMALLINT CHECK(com3 BETWEEN 1 AND 5), com4 SMALLINT CHECK(com4 BETWEEN 1 AND 5), com5 SMALLINT CHECK(com5 BETWEEN 1 AND 5),
  -- H. Gestión del Grupo (5)
  ges1 SMALLINT CHECK(ges1 BETWEEN 1 AND 5), ges2 SMALLINT CHECK(ges2 BETWEEN 1 AND 5), ges3 SMALLINT CHECK(ges3 BETWEEN 1 AND 5), ges4 SMALLINT CHECK(ges4 BETWEEN 1 AND 5), ges5 SMALLINT CHECK(ges5 BETWEEN 1 AND 5),
  -- I. Uso de la Tecnología (5)
  tec1 SMALLINT CHECK(tec1 BETWEEN 1 AND 5), tec2 SMALLINT CHECK(tec2 BETWEEN 1 AND 5), tec3 SMALLINT CHECK(tec3 BETWEEN 1 AND 5), tec4 SMALLINT CHECK(tec4 BETWEEN 1 AND 5), tec5 SMALLINT CHECK(tec5 BETWEEN 1 AND 5),
  -- J. Satisfacción Global (5)
  sat1 SMALLINT CHECK(sat1 BETWEEN 1 AND 5), sat2 SMALLINT CHECK(sat2 BETWEEN 1 AND 5), sat3 SMALLINT CHECK(sat3 BETWEEN 1 AND 5), sat4 SMALLINT CHECK(sat4 BETWEEN 1 AND 5), sat5 SMALLINT CHECK(sat5 BETWEEN 1 AND 5),
  -- Comentarios
  comentarios TEXT,
  fecha_respuesta TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promedio general desde los 51 reactivos (calculado en aplicación)
-- No usamos GENERATED para evitar repetir 51 columnas. Se calcula en el service layer.

ALTER TABLE encuesta_estudiantil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Estudiante inserta encuesta anónima" ON encuesta_estudiantil
  FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) = 'estudiante');

CREATE POLICY "Staff y docente leen resultados" ON encuesta_estudiantil
  FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador','docente'));

CREATE INDEX idx_ee_docente ON encuesta_estudiantil(docente_id);
