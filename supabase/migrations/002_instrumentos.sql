-- =============================================================
-- Migración 003: Autodiagnóstico Docente
-- =============================================================
-- Modifica tabla docentes (campos de perfil)
-- Crea tabla autodiagnosticos (24 reactivos Likert 1-5)
-- =============================================================

-- 1. Agregar columnas de perfil a docentes
ALTER TABLE docentes
  ADD COLUMN IF NOT EXISTS apellido_paterno VARCHAR(100),
  ADD COLUMN IF NOT EXISTS apellido_materno VARCHAR(100),
  ADD COLUMN IF NOT EXISTS campus VARCHAR(100),
  ADD COLUMN IF NOT EXISTS turno VARCHAR(50),
  ADD COLUMN IF NOT EXISTS oferta_academica TEXT;

-- Migrar datos existentes: split apellidos en paterno/materno
UPDATE docentes
SET apellido_paterno = SPLIT_PART(apellidos, ' ', 1),
    apellido_materno = CASE
      WHEN array_length(string_to_array(apellidos, ' '), 1) > 1
      THEN array_to_string((string_to_array(apellidos, ' '))[2:], ' ')
      ELSE NULL
    END
WHERE apellido_paterno IS NULL AND apellidos IS NOT NULL;

-- 2. Tabla de autodiagnósticos
CREATE TABLE IF NOT EXISTS IF NOT EXISTS autodiagnosticos (
  id                SERIAL PRIMARY KEY,
  docente_id        INT REFERENCES docentes(id),
  cuatrimestre_id   INT REFERENCES cuatrimestres(id),
  -- 24 reactivos (1-5)
  r1  SMALLINT CHECK (r1  BETWEEN 1 AND 5),
  r2  SMALLINT CHECK (r2  BETWEEN 1 AND 5),
  r3  SMALLINT CHECK (r3  BETWEEN 1 AND 5),
  r4  SMALLINT CHECK (r4  BETWEEN 1 AND 5),
  r5  SMALLINT CHECK (r5  BETWEEN 1 AND 5),
  r6  SMALLINT CHECK (r6  BETWEEN 1 AND 5),
  r7  SMALLINT CHECK (r7  BETWEEN 1 AND 5),
  r8  SMALLINT CHECK (r8  BETWEEN 1 AND 5),
  r9  SMALLINT CHECK (r9  BETWEEN 1 AND 5),
  r10 SMALLINT CHECK (r10 BETWEEN 1 AND 5),
  r11 SMALLINT CHECK (r11 BETWEEN 1 AND 5),
  r12 SMALLINT CHECK (r12 BETWEEN 1 AND 5),
  r13 SMALLINT CHECK (r13 BETWEEN 1 AND 5),
  r14 SMALLINT CHECK (r14 BETWEEN 1 AND 5),
  r15 SMALLINT CHECK (r15 BETWEEN 1 AND 5),
  r16 SMALLINT CHECK (r16 BETWEEN 1 AND 5),
  r17 SMALLINT CHECK (r17 BETWEEN 1 AND 5),
  r18 SMALLINT CHECK (r18 BETWEEN 1 AND 5),
  r19 SMALLINT CHECK (r19 BETWEEN 1 AND 5),
  r20 SMALLINT CHECK (r20 BETWEEN 1 AND 5),
  r21 SMALLINT CHECK (r21 BETWEEN 1 AND 5),
  r22 SMALLINT CHECK (r22 BETWEEN 1 AND 5),
  r23 SMALLINT CHECK (r23 BETWEEN 1 AND 5),
  r24 SMALLINT CHECK (r24 BETWEEN 1 AND 5),
  -- Calculado
  puntaje_total     SMALLINT GENERATED ALWAYS AS (
    COALESCE(r1,0)+COALESCE(r2,0)+COALESCE(r3,0)+COALESCE(r4,0)+
    COALESCE(r5,0)+COALESCE(r6,0)+COALESCE(r7,0)+COALESCE(r8,0)+
    COALESCE(r9,0)+COALESCE(r10,0)+COALESCE(r11,0)+COALESCE(r12,0)+
    COALESCE(r13,0)+COALESCE(r14,0)+COALESCE(r15,0)+COALESCE(r16,0)+
    COALESCE(r17,0)+COALESCE(r18,0)+COALESCE(r19,0)+COALESCE(r20,0)+
    COALESCE(r21,0)+COALESCE(r22,0)+COALESCE(r23,0)+COALESCE(r24,0)
  ) STORED,
  nivel_desempeno   VARCHAR(20),
  comentarios       TEXT,
  fecha_respuesta   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(docente_id, cuatrimestre_id)
);

-- 3. RLS
ALTER TABLE autodiagnosticos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Docente inserta su autodiagnóstico" ON autodiagnosticos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
  );

DROP POLICY IF EXISTS "Docente lee su autodiagnóstico" ON autodiagnosticos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
  );

DROP POLICY IF EXISTS "Staff lee autodiagnósticos" ON autodiagnosticos
  FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
-- =============================================================
-- Migración 008: Observación de Clase (Formulario Coordinador)
-- 43 reactivos en 8 secciones (A-H)
-- =============================================================

CREATE TABLE IF NOT EXISTS IF NOT EXISTS observaciones (
  id                SERIAL PRIMARY KEY,
  docente_id        INT REFERENCES docentes(id),
  evaluador_id      UUID REFERENCES usuarios(id),
  oferta_academica  VARCHAR(100) NOT NULL,
  cuatrimestre_grupo VARCHAR(20) NOT NULL,
  ciclo             VARCHAR(10) NOT NULL,
  campus            VARCHAR(100) NOT NULL,
  -- Sección A: Cognitivas (7 reactivos CCO)
  cco1 SMALLINT, cco2 SMALLINT, cco3 SMALLINT, cco4 SMALLINT, cco5 SMALLINT, cco6 SMALLINT, cco7 SMALLINT,
  obs_cognitivas    TEXT,
  -- Sección B: Metacognitivas (9 reactivos CME)
  cme1 SMALLINT, cme2 SMALLINT, cme3 SMALLINT, cme4 SMALLINT, cme5 SMALLINT, cme6 SMALLINT, cme7 SMALLINT, cme8 SMALLINT, cme9 SMALLINT,
  obs_metacognitivas TEXT,
  -- Sección C: Comunicativas (4 reactivos CCOM)
  ccom1 SMALLINT, ccom2 SMALLINT, ccom3 SMALLINT, ccom4 SMALLINT,
  obs_comunicativas TEXT,
  -- Sección D: Sociales (4 reactivos CSO)
  cso1 SMALLINT, cso2 SMALLINT, cso3 SMALLINT, cso4 SMALLINT,
  obs_sociales      TEXT,
  -- Sección E: Gestión de la Enseñanza (7 reactivos CGE)
  cge1 SMALLINT, cge2 SMALLINT, cge3 SMALLINT, cge4 SMALLINT, cge5 SMALLINT, cge6 SMALLINT, cge7 SMALLINT,
  obs_gestion       TEXT,
  -- Sección F: Afectivas (2 reactivos CAF)
  caf1 SMALLINT, caf2 SMALLINT,
  obs_afectivas     TEXT,
  -- Sección G: Tecno-Pedagógicas (7 reactivos CTE-PE)
  ctepe1 SMALLINT, ctepe2 SMALLINT, ctepe3 SMALLINT, ctepe4 SMALLINT, ctepe5 SMALLINT, ctepe6 SMALLINT, ctepe7 SMALLINT,
  obs_tecno         TEXT,
  -- Sección H: Normativa (5 reactivos CNO)
  cno1 SMALLINT, cno2 SMALLINT, cno3 SMALLINT, cno4 SMALLINT, cno5 SMALLINT,
  obs_normativa     TEXT,
  -- Cierre
  comentario_docente     TEXT,
  comentario_evaluador   TEXT,
  fecha_observacion      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(docente_id, evaluador_id, ciclo)
);

-- RLS
ALTER TABLE observaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coordinador inserta observación" ON observaciones
  FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
DROP POLICY IF EXISTS "Staff lee observaciones" ON observaciones
  FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
DROP POLICY IF EXISTS "Docente lee sus observaciones" ON observaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
  );
-- =============================================================
-- Migración 009: Asignaturas por carrera + Planeaciones
-- =============================================================

-- 1. Vincular asignaturas con ofertas académicas
ALTER TABLE asignaturas ADD COLUMN IF NOT EXISTS oferta_academica_id INT REFERENCES ofertas_academicas(id);

-- 2. Tabla de planeaciones
CREATE TABLE IF NOT EXISTS IF NOT EXISTS planeaciones (
  id SERIAL PRIMARY KEY,
  docente_id INT REFERENCES docentes(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  asignatura_id INT REFERENCES asignaturas(id),
  campus TEXT, turno TEXT, modalidad TEXT,
  grupo TEXT NOT NULL,
  proyecto BOOLEAN DEFAULT false,
  laboratorio VARCHAR(10) DEFAULT 'No aplica',
  visitas VARCHAR(10) DEFAULT 'No aplica',
  url_pdf TEXT NOT NULL,
  nombre_archivo TEXT,
  comentario_docente TEXT,
  -- Evaluación del coordinador
  criterio_alineacion SMALLINT CHECK (criterio_alineacion BETWEEN 1 AND 5),
  criterio_secuencia SMALLINT CHECK (criterio_secuencia BETWEEN 1 AND 5),
  criterio_recursos SMALLINT CHECK (criterio_recursos BETWEEN 1 AND 5),
  criterio_evaluacion SMALLINT CHECK (criterio_evaluacion BETWEEN 1 AND 5),
  puntaje_promedio DECIMAL(4,2),
  estado VARCHAR(20) DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aprobado','Corrección')),
  comentario_retroalimentacion TEXT,
  comentario_interno TEXT,
  fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_evaluacion TIMESTAMP,
  UNIQUE(docente_id, cuatrimestre_id, asignatura_id)
);

-- 3. RLS
ALTER TABLE planeaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Docente gestiona sus planeaciones" ON planeaciones FOR ALL
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente'));

DROP POLICY IF EXISTS "Staff lee y evalúa planeaciones" ON planeaciones FOR ALL
  USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));

-- Corregir: DECIMAL(5,2) permite 100.00
ALTER TABLE planeaciones ALTER COLUMN puntaje_promedio TYPE DECIMAL(5,2);
-- =============================================================
-- Migración 010: Evaluación por Coordinación Académica (CA)
-- 15 reactivos en 5 categorías (A-E), escala 1-5, total máx 75
-- =============================================================

-- La tabla evaluacion_coordinacion ya existe (001). La adaptamos.
-- Si ya tiene datos viejos, los limpiamos.
DROP TABLE IF EXISTS evaluacion_coordinacion CASCADE;

CREATE TABLE IF NOT EXISTS evaluacion_coordinacion (
  id SERIAL PRIMARY KEY,
  docente_id INT REFERENCES docentes(id),
  evaluador_id UUID REFERENCES usuarios(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  ciclo VARCHAR(10) NOT NULL,
  campus VARCHAR(100) NOT NULL,
  -- Categoría A: Cumplimiento Académico (3 ítems)
  a1 SMALLINT CHECK (a1 BETWEEN 1 AND 5), a2 SMALLINT CHECK (a2 BETWEEN 1 AND 5), a3 SMALLINT CHECK (a3 BETWEEN 1 AND 5),
  -- Categoría B: Gestión y Organización (3 ítems)
  b1 SMALLINT CHECK (b1 BETWEEN 1 AND 5), b2 SMALLINT CHECK (b2 BETWEEN 1 AND 5), b3 SMALLINT CHECK (b3 BETWEEN 1 AND 5),
  -- Categoría C: Desempeño Profesional (3 ítems)
  c1 SMALLINT CHECK (c1 BETWEEN 1 AND 5), c2 SMALLINT CHECK (c2 BETWEEN 1 AND 5), c3 SMALLINT CHECK (c3 BETWEEN 1 AND 5),
  -- Categoría D: Innovación y Mejora (3 ítems)
  d1 SMALLINT CHECK (d1 BETWEEN 1 AND 5), d2 SMALLINT CHECK (d2 BETWEEN 1 AND 5), d3 SMALLINT CHECK (d3 BETWEEN 1 AND 5),
  -- Categoría E: Compromiso y Ética (3 ítems)
  e1 SMALLINT CHECK (e1 BETWEEN 1 AND 5), e2 SMALLINT CHECK (e2 BETWEEN 1 AND 5), e3 SMALLINT CHECK (e3 BETWEEN 1 AND 5),
  -- Calculados
  puntos_obtenidos SMALLINT GENERATED ALWAYS AS (
    COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+
    COALESCE(b1,0)+COALESCE(b2,0)+COALESCE(b3,0)+
    COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+
    COALESCE(d1,0)+COALESCE(d2,0)+COALESCE(d3,0)+
    COALESCE(e1,0)+COALESCE(e2,0)+COALESCE(e3,0)
  ) STORED,
  score_normalizado DECIMAL(5,2) GENERATED ALWAYS AS (
    (COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+COALESCE(b1,0)+COALESCE(b2,0)+COALESCE(b3,0)+COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+COALESCE(d1,0)+COALESCE(d2,0)+COALESCE(d3,0)+COALESCE(e1,0)+COALESCE(e2,0)+COALESCE(e3,0)) / 75.0 * 100
  ) STORED,
  categoria VARCHAR(20) GENERATED ALWAYS AS (
    CASE
      WHEN (COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+COALESCE(b1,0)+COALESCE(b2,0)+COALESCE(b3,0)+COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+COALESCE(d1,0)+COALESCE(d2,0)+COALESCE(d3,0)+COALESCE(e1,0)+COALESCE(e2,0)+COALESCE(e3,0)) >= 60 THEN 'excelente'
      WHEN (COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+COALESCE(b1,0)+COALESCE(b2,0)+COALESCE(b3,0)+COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+COALESCE(d1,0)+COALESCE(d2,0)+COALESCE(d3,0)+COALESCE(e1,0)+COALESCE(e2,0)+COALESCE(e3,0)) >= 45 THEN 'buena'
      WHEN (COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+COALESCE(b1,0)+COALESCE(b2,0)+COALESCE(b3,0)+COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+COALESCE(d1,0)+COALESCE(d2,0)+COALESCE(d3,0)+COALESCE(e1,0)+COALESCE(e2,0)+COALESCE(e3,0)) >= 30 THEN 'aceptable'
      ELSE 'deficiente'
    END
  ) STORED,
  comentarios TEXT,
  fecha_evaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(docente_id, evaluador_id, cuatrimestre_id)
);

ALTER TABLE evaluacion_coordinacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coordinador inserta evaluación" ON evaluacion_coordinacion FOR INSERT
  WITH CHECK (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
DROP POLICY IF EXISTS "Staff lee evaluaciones" ON evaluacion_coordinacion FOR SELECT
  USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
DROP POLICY IF EXISTS "Docente lee su evaluación" ON evaluacion_coordinacion FOR SELECT
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente'));

CREATE INDEX idx_ec_docente ON evaluacion_coordinacion(docente_id);
-- Migración 011: Tabla de preguntas editables para instrumentos
CREATE TABLE IF NOT EXISTS IF NOT EXISTS instrumento_preguntas (
  id SERIAL PRIMARY KEY,
  instrumento VARCHAR(50) NOT NULL, -- 'autodiagnostico','observacion','coordinacion','planeacion','encuesta'
  seccion VARCHAR(10),              -- 'A','B', etc. o NULL
  orden SMALLINT NOT NULL,
  texto TEXT NOT NULL,
  escala_min SMALLINT DEFAULT 1,
  escala_max SMALLINT DEFAULT 5,
  activa BOOLEAN DEFAULT TRUE,
  UNIQUE(instrumento, orden)
);

ALTER TABLE instrumento_preguntas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff gestiona preguntas" ON instrumento_preguntas FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');
DROP POLICY IF EXISTS "Todos leen preguntas" ON instrumento_preguntas FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed: preguntas de autodiagnóstico (24 reactivos)
INSERT INTO instrumento_preguntas (instrumento, seccion, orden, texto) VALUES
('autodiagnostico',NULL,1,'Domino los conceptos para la construcción del aprendizaje en los cursos o programas académicos que imparto.'),
('autodiagnostico',NULL,2,'Expongo, organizo, desarrollo y vinculo los contenidos en forma clara.'),
('autodiagnostico',NULL,3,'Adapto los contenidos a los diversos estilos y necesidades de los estudiantes.'),
('autodiagnostico',NULL,4,'Organizo espacios de reflexión antes, durante y después de las actividades de aprendizaje.'),
('autodiagnostico',NULL,5,'Incluyo actividades en clase que promueven el aprendizaje autónomo en los estudiantes.'),
('autodiagnostico',NULL,6,'Propongo ejercicios para promover la metacognición en su ambiente de aprendizaje.'),
('autodiagnostico',NULL,7,'Propongo nuevas estrategias para mejorar los resultados obtenidos en el desempeño de los estudiantes.'),
('autodiagnostico',NULL,8,'Me comunico con claridad y precisión.'),
('autodiagnostico',NULL,9,'Escucho activamente a mis estudiantes.'),
('autodiagnostico',NULL,10,'Fomento la participación y el diálogo respetuoso.'),
('autodiagnostico',NULL,11,'Mantengo un trato respetuoso con mis estudiantes.'),
('autodiagnostico',NULL,12,'Atiendo situaciones grupales con sensibilidad y objetividad.'),
('autodiagnostico',NULL,13,'Organizo los objetivos y contenidos de manera coherente con el modelo educativo.'),
('autodiagnostico',NULL,14,'Implemento diversas estrategias para inducir el aprendizaje significativo.'),
('autodiagnostico',NULL,15,'Considero saberes previos, intereses y experiencias de sus estudiantes.'),
('autodiagnostico',NULL,16,'Genero oportunidades de desarrollo del pensamiento crítico y creativo.'),
('autodiagnostico',NULL,17,'Motivo al aprendizaje, la indagación y la búsqueda de conocimiento.'),
('autodiagnostico',NULL,18,'Ofrezco retroalimentación oportuna, pertinente y cálida a los estudiantes.'),
('autodiagnostico',NULL,19,'Promuevo un ambiente de confianza y respeto.'),
('autodiagnostico',NULL,20,'Manejo mis emociones de forma profesional en clase.'),
('autodiagnostico',NULL,21,'Utilizo herramientas tecnológicas para enriquecer mi enseñanza.'),
('autodiagnostico',NULL,22,'Integro recursos digitales de forma adecuada a los contenidos.'),
('autodiagnostico',NULL,23,'Conozco y aplico la normatividad institucional.'),
('autodiagnostico',NULL,24,'Respeto el reglamento y lineamientos académicos.')
ON CONFLICT (instrumento, orden) DO NOTHING;
-- Migración 012: Mejorar editor de preguntas con tipo de respuesta y opciones
ALTER TABLE instrumento_preguntas ADD COLUMN IF NOT EXISTS tipo_respuesta VARCHAR(20) DEFAULT 'cerrada' CHECK (tipo_respuesta IN ('abierta','cerrada','opcion_multiple'));
ALTER TABLE instrumento_preguntas ADD COLUMN IF NOT EXISTS opciones JSONB DEFAULT '[]';
-- Seed: Preguntas para Observación de Clase (45 reactivos, secciones A-H)
INSERT INTO instrumento_preguntas (instrumento, seccion, orden, texto) VALUES
('observacion','A',1,'Expone, organiza, desarrolla y vincula los contenidos en forma clara.'),
('observacion','A',2,'Relaciona los contenidos con situaciones reales o casos prácticos del entorno profesional.'),
('observacion','A',3,'Adapta los contenidos a los diversos estilos y necesidades de los estudiantes.'),
('observacion','A',4,'Explica conceptos complejos utilizando analogías, ejemplos claros y lenguaje accesible.'),
('observacion','A',5,'Clarifica términos técnicos o especializados según el nivel académico del grupo.'),
('observacion','A',6,'Facilita la apropiación del conocimiento mediante explicaciones estructuradas.'),
('observacion','A',7,'Promueve el razonamiento crítico y la resolución de problemas durante la clase.'),
('observacion','B',8,'Organiza espacios de reflexión antes, durante y después de las actividades.'),
('observacion','B',9,'Orienta a los estudiantes para que identifiquen sus fortalezas y áreas de oportunidad.'),
('observacion','B',10,'Incluye actividades en clase que promueven el aprendizaje autónomo.'),
('observacion','B',11,'Propone ejercicios para promover la metacognición.'),
('observacion','B',12,'Propone nuevas estrategias para mejorar los resultados obtenidos.'),
('observacion','B',13,'Favorece la transferencia de conocimientos a nuevas situaciones o contextos.'),
('observacion','B',14,'Promueve la formulación de preguntas y el pensamiento reflexivo en el aula.'),
('observacion','B',15,'Invita a los estudiantes a seleccionar estrategias de estudio.'),
('observacion','B',16,'Integra momentos de análisis sobre los errores como oportunidades de mejora.'),
('observacion','C',17,'Se comunica con un lenguaje oral y escrito apropiado y de respeto.'),
('observacion','C',18,'Se comunica con un lenguaje no verbal (corporal) apropiado y de respeto.'),
('observacion','C',19,'Comunica los propósitos, procedimientos y resultados esperados.'),
('observacion','C',20,'Diseña actividades que desarrollen la expresión escrita y oral de los estudiantes.'),
('observacion','D',21,'Procura relaciones empáticas y de respeto dentro de la praxis docente.'),
('observacion','D',22,'Proporciona igualdad de oportunidades de participación.'),
('observacion','D',23,'Promueve compromiso y solidaridad entre los estudiantes.'),
('observacion','D',24,'Establece un clima de relaciones interpersonales respetuosas y empáticas.'),
('observacion','E',25,'Organiza los objetivos y contenidos de manera coherente con el modelo TUP.'),
('observacion','E',26,'Implementa diversas estrategias para inducir el aprendizaje significativo.'),
('observacion','E',27,'Considera saberes previos, intereses y experiencias de sus estudiantes.'),
('observacion','E',28,'Genera oportunidades de desarrollo del pensamiento crítico y creativo.'),
('observacion','E',29,'Motiva al aprendizaje, la indagación y la búsqueda de conocimiento.'),
('observacion','E',30,'Integra recursos tecnológicos, didácticos y materiales complementarios.'),
('observacion','E',31,'Ofrece retroalimentación oportuna, pertinente y cálida a sus estudiantes.'),
('observacion','F',32,'Genera un ambiente propicio para el aprendizaje basado en confianza y respeto.'),
('observacion','F',33,'Identifica las fortalezas de sus estudiantes, las destaca y ofrece espacios.'),
('observacion','G',34,'Diseña tareas integradoras de proyectos utilizando las NTIC.'),
('observacion','G',35,'Promueve el empoderamiento y participación del estudiante en el uso de NTIC.'),
('observacion','G',36,'Muestra dominio en el uso de la tecnología como recurso para la enseñanza.'),
('observacion','G',37,'Aplica métodos y técnicas pertinentes a la didáctica de su campo.'),
('observacion','G',38,'Identifica estrategias de enseñanza y dificultades recurrentes.'),
('observacion','G',39,'Promueve el uso responsable, ético y seguro de las tecnologías.'),
('observacion','G',40,'Genera situaciones de aprendizaje adecuadas a los niveles de desarrollo.'),
('observacion','H',41,'Inicia puntualmente su sesión.'),
('observacion','H',42,'Entrega en tiempo y forma la planeación docente correspondiente.'),
('observacion','H',43,'Desarrolla el tema correspondiente a la semana o unidad establecida.'),
('observacion','H',44,'Registra la asistencia, evaluaciones y avances en medios institucionales.'),
('observacion','H',45,'Concluye su sesión en el tiempo señalado.')
ON CONFLICT (instrumento, orden) DO NOTHING;

-- Coordinación Académica (15 reactivos, secciones A-E)
INSERT INTO instrumento_preguntas (instrumento, seccion, orden, texto) VALUES
('coordinacion','A',1,'Cumplimiento del programa, planeación y avance académico.'),
('coordinacion','A',2,'Organización y conducción de sesiones (presenciales, virtuales o ejecutivas).'),
('coordinacion','A',3,'Uso y disponibilidad de materiales didácticos o recursos en plataforma.'),
('coordinacion','B',4,'Entrega de calificaciones en tiempo y forma.'),
('coordinacion','B',5,'Puntualidad, asistencia y cumplimiento administrativo.'),
('coordinacion','B',6,'Uso adecuado de plataformas institucionales (Moodle, Saeko, sistemas).'),
('coordinacion','C',7,'Comunicación clara, oportuna y profesional con estudiantes y coordinación.'),
('coordinacion','C',8,'Trabajo colaborativo con docentes y áreas institucionales.'),
('coordinacion','C',9,'Participación en reuniones, actividades y procesos institucionales.'),
('coordinacion','D',10,'Implementación de estrategias didácticas innovadoras.'),
('coordinacion','D',11,'Participación en procesos de capacitación o actualización docente.'),
('coordinacion','D',12,'Aplicación de mejoras en su práctica docente.'),
('coordinacion','E',13,'Cumplimiento de normatividad institucional.'),
('coordinacion','E',14,'Trato respetuoso, ético y profesional.'),
('coordinacion','E',15,'Representación institucional adecuada en entornos presenciales o digitales.')
ON CONFLICT (instrumento, orden) DO NOTHING;

-- Planeación Docente (4 criterios)
INSERT INTO instrumento_preguntas (instrumento, seccion, orden, texto) VALUES
('planeacion',NULL,1,'Alineación Curricular — Coherencia con el plan de estudios y perfil de egreso.'),
('planeacion',NULL,2,'Secuencia Didáctica — Estructura lógica de las actividades de aprendizaje.'),
('planeacion',NULL,3,'Recursos y Materiales (NTIC) — Uso de tecnología y materiales didácticos.'),
('planeacion',NULL,4,'Sistemas de Evaluación — Instrumentos y criterios de evaluación claros.')
ON CONFLICT (instrumento, orden) DO NOTHING;
-- Migración 014: Modalidad en docentes
ALTER TABLE docentes ADD COLUMN IF NOT EXISTS modalidad TEXT DEFAULT 'Escolarizado';
-- Migración 028: Evaluación por materia + modalidad en grupos
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS modalidad VARCHAR(50) DEFAULT 'Escolarizado';
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS turno_grupo VARCHAR(50);
ALTER TABLE asignaturas ADD COLUMN IF NOT EXISTS modalidad VARCHAR(50);
ALTER TABLE observaciones ADD COLUMN IF NOT EXISTS asignatura_id INT REFERENCES asignaturas(id);
ALTER TABLE observaciones ADD COLUMN IF NOT EXISTS grupo_id_fk INT REFERENCES grupos(id);
ALTER TABLE evaluacion_coordinacion ADD COLUMN IF NOT EXISTS asignatura_id INT REFERENCES asignaturas(id);
