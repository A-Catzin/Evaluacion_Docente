-- =============================================================
-- Migración 001: Esquema Base SED-360 v2
-- =============================================================
-- LIMPIEZA PREVIA (ignorar errores si no existen)
-- =============================================================
DROP TABLE IF EXISTS calificacion_final_docente CASCADE;
DROP TABLE IF EXISTS evaluacion_coordinacion CASCADE;
DROP TABLE IF EXISTS observaciones CASCADE;
DROP TABLE IF EXISTS planeaciones CASCADE;
DROP TABLE IF EXISTS autodiagnosticos CASCADE;
DROP TABLE IF EXISTS encuesta_estudiantil CASCADE;
DROP TABLE IF EXISTS encuesta_control_envio CASCADE;
DROP TABLE IF EXISTS inscripciones CASCADE;
DROP TABLE IF EXISTS grupos CASCADE;
DROP TABLE IF EXISTS asignaturas CASCADE;
DROP TABLE IF EXISTS estudiantes CASCADE;
DROP TABLE IF EXISTS docentes CASCADE;
DROP TABLE IF EXISTS licenciaturas CASCADE;
DROP TABLE IF EXISTS ofertas_academicas CASCADE;
DROP TABLE IF EXISTS campus CASCADE;
DROP TABLE IF EXISTS turnos CASCADE;
DROP TABLE IF EXISTS cuatrimestres CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS instrumento_preguntas CASCADE;
-- Adaptado para PostgreSQL + Supabase Auth
-- Cuatrimestre de referencia: 26-1
-- =============================================================

-- ⚠️ Eliminar tablas v1 si existen (solo en desarrollo)
DROP TABLE IF EXISTS evaluaciones CASCADE;
DROP TABLE IF EXISTS cargas_academicas CASCADE;
DROP TABLE IF EXISTS periodos CASCADE;
DROP MATERIALIZED VIEW IF EXISTS resultados_agregados;

-- =============================================================
-- 1. TABLAS CATÁLOGO
-- =============================================================

-- 1.1 Cuatrimestres
DROP TABLE IF EXISTS cuatrimestres (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(10) NOT NULL UNIQUE,
    nombre          VARCHAR(50) NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    activo          BOOLEAN DEFAULT TRUE,
    cerrado         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1.2 Licenciaturas
DROP TABLE IF EXISTS licenciaturas (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(10) NOT NULL UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    facultad        VARCHAR(100),
    activa          BOOLEAN DEFAULT TRUE
);

-- 1.3 Docentes
DROP TABLE IF EXISTS docentes (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    num_empleado    VARCHAR(20) UNIQUE,
    licenciatura_id INT REFERENCES licenciaturas(id),
    foto_url        VARCHAR(255),
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1.4 Asignaturas
DROP TABLE IF EXISTS asignaturas (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(20) NOT NULL UNIQUE,
    nombre          VARCHAR(150) NOT NULL,
    licenciatura_id INT REFERENCES licenciaturas(id),
    cuatrimestre_num INT,
    creditos        INT DEFAULT 5,
    activa          BOOLEAN DEFAULT TRUE
);

-- 1.5 Grupos
DROP TABLE IF EXISTS grupos (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(20) NOT NULL,
    asignatura_id   INT REFERENCES asignaturas(id),
    docente_id      INT REFERENCES docentes(id),
    cuatrimestre_id INT REFERENCES cuatrimestres(id),
    num_alumnos     INT DEFAULT 0,
    activo          BOOLEAN DEFAULT TRUE
);

-- 1.6 Estudiantes
DROP TABLE IF EXISTS estudiantes (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    matricula       VARCHAR(20) UNIQUE NOT NULL,
    licenciatura_id INT REFERENCES licenciaturas(id),
    cuatrimestre_actual INT,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1.7 Inscripciones (estudiante ↔ grupo)
DROP TABLE IF EXISTS inscripciones (
    id              SERIAL PRIMARY KEY,
    estudiante_id   INT REFERENCES estudiantes(id),
    grupo_id        INT REFERENCES grupos(id),
    cuatrimestre_id INT REFERENCES cuatrimestres(id),
    fecha           DATE DEFAULT CURRENT_DATE,
    UNIQUE(estudiante_id, grupo_id)
);

-- =============================================================
-- 2. USUARIOS (sincronizado con auth.users de Supabase)
-- =============================================================

-- Modificar tabla usuarios existente (si existe de v1, se recrea)
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS usuarios (
    id              UUID REFERENCES auth.users PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    rol             VARCHAR(20) CHECK (rol IN ('superadmin','coordinador','docente','estudiante')) NOT NULL,
    entidad_id      INT,  -- FK a docentes.id o estudiantes.id según rol
    activo          BOOLEAN DEFAULT TRUE,
    ultimo_acceso   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger: crear usuario automáticamente al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.crear_usuario_nuevo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.usuarios (id, email, rol)
    VALUES (NEW.id, NEW.email, 'estudiante');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.crear_usuario_nuevo();

-- =============================================================
-- 3. INSTRUMENTOS DE EVALUACIÓN
-- =============================================================

-- 3.1 Instrumento 1: Encuesta Estudiantil (EE) — 40%
DROP TABLE IF EXISTS encuesta_estudiantil_respuestas (
    id                  SERIAL PRIMARY KEY,
    docente_id          INT REFERENCES docentes(id),
    grupo_id            INT REFERENCES grupos(id),
    cuatrimestre_id     INT REFERENCES cuatrimestres(id),
    fecha_respuesta     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Calidad general (1-6)
    calidad_general     SMALLINT NOT NULL CHECK (calidad_general BETWEEN 1 AND 6),
    -- 18 ítems Likert (1-4)
    item_plan_estudio          SMALLINT CHECK (item_plan_estudio BETWEEN 1 AND 4),
    item_trato_respeto         SMALLINT CHECK (item_trato_respeto BETWEEN 1 AND 4),
    item_asistencia            SMALLINT CHECK (item_asistencia BETWEEN 1 AND 4),
    item_puntualidad           SMALLINT CHECK (item_puntualidad BETWEEN 1 AND 4),
    item_participacion         SMALLINT CHECK (item_participacion BETWEEN 1 AND 4),
    item_dominio_materia       SMALLINT CHECK (item_dominio_materia BETWEEN 1 AND 4),
    item_plataforma_moodle     SMALLINT CHECK (item_plataforma_moodle BETWEEN 1 AND 4),
    item_pensamiento_critico   SMALLINT CHECK (item_pensamiento_critico BETWEEN 1 AND 4),
    item_desafio_intelectual   SMALLINT CHECK (item_desafio_intelectual BETWEEN 1 AND 4),
    item_claridad_objetivos    SMALLINT CHECK (item_claridad_objetivos BETWEEN 1 AND 4),
    item_lecturas_aprendizaje  SMALLINT CHECK (item_lecturas_aprendizaje BETWEEN 1 AND 4),
    item_respeto_reglas        SMALLINT CHECK (item_respeto_reglas BETWEEN 1 AND 4),
    item_interes_materia       SMALLINT CHECK (item_interes_materia BETWEEN 1 AND 4),
    item_apoyos_didacticos     SMALLINT CHECK (item_apoyos_didacticos BETWEEN 1 AND 4),
    item_actitudes_valores     SMALLINT CHECK (item_actitudes_valores BETWEEN 1 AND 4),
    item_retroalimentacion     SMALLINT CHECK (item_retroalimentacion BETWEEN 1 AND 4),
    item_criterios_evaluacion  SMALLINT CHECK (item_criterios_evaluacion BETWEEN 1 AND 4),
    item_receptividad          SMALLINT CHECK (item_receptividad BETWEEN 1 AND 4),
    comentario_abierto         TEXT,
    clasificacion_comentario   VARCHAR(20) DEFAULT 'neutro'
        CHECK (clasificacion_comentario IN ('excelente','neutro','a_mejorar','critico','foco_rojo')),
    anonimo                    BOOLEAN DEFAULT TRUE
);

-- 3.1b Tabla de control de envío (anónimo — solo registra QUE respondió)
DROP TABLE IF EXISTS encuesta_control_envio (
    id              SERIAL PRIMARY KEY,
    estudiante_id   INT REFERENCES estudiantes(id),
    grupo_id        INT REFERENCES grupos(id),
    cuatrimestre_id INT REFERENCES cuatrimestres(id),
    fecha_envio     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(estudiante_id, grupo_id, cuatrimestre_id)
);

-- 3.2 Instrumento 2: Evaluación por Coordinación (CA) — 25%
DROP TABLE IF EXISTS evaluacion_coordinacion (
    id                  SERIAL PRIMARY KEY,
    docente_id          INT REFERENCES docentes(id),
    coordinador_id      UUID REFERENCES usuarios(id),
    cuatrimestre_id     INT REFERENCES cuatrimestres(id),
    fecha_evaluacion    DATE NOT NULL,
    puntos_obtenidos    DECIMAL(5,2) NOT NULL CHECK (puntos_obtenidos BETWEEN 0 AND 75),
    categoria           VARCHAR(20) NOT NULL
        CHECK (categoria IN ('excelente','buena','aceptable','deficiente','insuficiente')),
    dim_planificacion   DECIMAL(4,2),
    dim_estrategias     DECIMAL(4,2),
    dim_evaluacion      DECIMAL(4,2),
    dim_clima_aula      DECIMAL(4,2),
    dim_comunicacion    DECIMAL(4,2),
    dim_cumplimiento    DECIMAL(4,2),
    observaciones       TEXT,
    score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS ((puntos_obtenidos / 75.0) * 100) STORED,
    UNIQUE(docente_id, cuatrimestre_id, coordinador_id)
);

-- 3.3 Instrumento 3: Planeación Docente (PD) — 15%
DROP TABLE IF EXISTS evaluacion_planeacion (
    id                      SERIAL PRIMARY KEY,
    docente_id              INT REFERENCES docentes(id),
    evaluador_id            UUID REFERENCES usuarios(id),
    cuatrimestre_id         INT REFERENCES cuatrimestres(id),
    asignatura_id           INT REFERENCES asignaturas(id),
    fecha_evaluacion        DATE NOT NULL,
    criterio_elementos_curriculares   SMALLINT CHECK (criterio_elementos_curriculares BETWEEN 0 AND 2),
    criterio_fase_inicio              SMALLINT CHECK (criterio_fase_inicio BETWEEN 0 AND 2),
    criterio_fase_desarrollo          SMALLINT CHECK (criterio_fase_desarrollo BETWEEN 0 AND 2),
    criterio_fase_cierre              SMALLINT CHECK (criterio_fase_cierre BETWEEN 0 AND 2),
    criterio_caracteristicas_act      SMALLINT CHECK (criterio_caracteristicas_act BETWEEN 0 AND 2),
    criterio_estrategias_didacticas   SMALLINT CHECK (criterio_estrategias_didacticas BETWEEN 0 AND 2),
    criterio_recursos_didacticos      SMALLINT CHECK (criterio_recursos_didacticos BETWEEN 0 AND 2),
    criterio_organizacion_grupo       SMALLINT CHECK (criterio_organizacion_grupo BETWEEN 0 AND 2),
    criterio_estrategias_evaluacion   SMALLINT CHECK (criterio_estrategias_evaluacion BETWEEN 0 AND 2),
    criterio_productos                SMALLINT CHECK (criterio_productos BETWEEN 0 AND 2),
    criterio_bibliografia             SMALLINT CHECK (criterio_bibliografia BETWEEN 0 AND 2),
    puntos_totales          SMALLINT GENERATED ALWAYS AS (
        COALESCE(criterio_elementos_curriculares,0) + COALESCE(criterio_fase_inicio,0) +
        COALESCE(criterio_fase_desarrollo,0) + COALESCE(criterio_fase_cierre,0) +
        COALESCE(criterio_caracteristicas_act,0) + COALESCE(criterio_estrategias_didacticas,0) +
        COALESCE(criterio_recursos_didacticos,0) + COALESCE(criterio_organizacion_grupo,0) +
        COALESCE(criterio_estrategias_evaluacion,0) + COALESCE(criterio_productos,0) +
        COALESCE(criterio_bibliografia,0)
    ) STORED,
    categoria               VARCHAR(20) CHECK (categoria IN ('excelente','bueno','regular','insuficiente')),
    comentarios             TEXT,
    score_normalizado       DECIMAL(5,2) GENERATED ALWAYS AS (
        (COALESCE(criterio_elementos_curriculares,0) + COALESCE(criterio_fase_inicio,0) +
         COALESCE(criterio_fase_desarrollo,0) + COALESCE(criterio_fase_cierre,0) +
         COALESCE(criterio_caracteristicas_act,0) + COALESCE(criterio_estrategias_didacticas,0) +
         COALESCE(criterio_recursos_didacticos,0) + COALESCE(criterio_organizacion_grupo,0) +
         COALESCE(criterio_estrategias_evaluacion,0) + COALESCE(criterio_productos,0) +
         COALESCE(criterio_bibliografia,0)) / 22.0 * 100
    ) STORED,
    UNIQUE(docente_id, cuatrimestre_id, asignatura_id, evaluador_id)
);

-- 3.4 Instrumento 4: Observación de Clase (OC) — 15%
DROP TABLE IF EXISTS observacion_clase (
    id                  SERIAL PRIMARY KEY,
    docente_id          INT REFERENCES docentes(id),
    observador_id       UUID REFERENCES usuarios(id),
    cuatrimestre_id     INT REFERENCES cuatrimestres(id),
    grupo_id            INT REFERENCES grupos(id),
    fecha_observacion   DATE NOT NULL,
    hora_inicio         TIME,
    hora_fin            TIME,
    puntuacion_total    DECIMAL(4,2) NOT NULL CHECK (puntuacion_total BETWEEN 0 AND 10),
    dim_inicio_clase    DECIMAL(3,2),
    dim_desarrollo      DECIMAL(3,2),
    dim_cierre          DECIMAL(3,2),
    dim_clima_aula      DECIMAL(3,2),
    dim_uso_recursos    DECIMAL(3,2),
    categoria           VARCHAR(20) NOT NULL CHECK (categoria IN ('ejemplar','eficaz','por_validar')),
    observaciones       TEXT,
    recomendaciones     TEXT,
    score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS (puntuacion_total * 10) STORED,
    UNIQUE(docente_id, cuatrimestre_id, grupo_id, observador_id)
);

-- 3.5 Instrumento 5: Auto-evaluación Docente (AE) — 5%
DROP TABLE IF EXISTS autoevaluacion_docente (
    id                  SERIAL PRIMARY KEY,
    docente_id          INT REFERENCES docentes(id),
    cuatrimestre_id     INT REFERENCES cuatrimestres(id),
    fecha_respuesta     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ae_planificacion_clases      SMALLINT CHECK (ae_planificacion_clases BETWEEN 1 AND 3),
    ae_dominio_contenido         SMALLINT CHECK (ae_dominio_contenido BETWEEN 1 AND 3),
    ae_estrategias_didacticas    SMALLINT CHECK (ae_estrategias_didacticas BETWEEN 1 AND 3),
    ae_retroalimentacion         SMALLINT CHECK (ae_retroalimentacion BETWEEN 1 AND 3),
    ae_puntualidad_asistencia    SMALLINT CHECK (ae_puntualidad_asistencia BETWEEN 1 AND 3),
    ae_uso_plataforma            SMALLINT CHECK (ae_uso_plataforma BETWEEN 1 AND 3),
    ae_trato_estudiantes         SMALLINT CHECK (ae_trato_estudiantes BETWEEN 1 AND 3),
    ae_cumplimiento_programa     SMALLINT CHECK (ae_cumplimiento_programa BETWEEN 1 AND 3),
    ae_actualizacion_profesional SMALLINT CHECK (ae_actualizacion_profesional BETWEEN 1 AND 3),
    ae_evaluacion_aprendizaje    SMALLINT CHECK (ae_evaluacion_aprendizaje BETWEEN 1 AND 3),
    score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS (
        (COALESCE(ae_planificacion_clases,1) + COALESCE(ae_dominio_contenido,1) +
         COALESCE(ae_estrategias_didacticas,1) + COALESCE(ae_retroalimentacion,1) +
         COALESCE(ae_puntualidad_asistencia,1) + COALESCE(ae_uso_plataforma,1) +
         COALESCE(ae_trato_estudiantes,1) + COALESCE(ae_cumplimiento_programa,1) +
         COALESCE(ae_actualizacion_profesional,1) + COALESCE(ae_evaluacion_aprendizaje,1)) / 30.0 * 100
    ) STORED,
    categoria           VARCHAR(20) CHECK (categoria IN ('muy_bueno','bueno','no_aplico')),
    reflexion_personal  TEXT,
    UNIQUE(docente_id, cuatrimestre_id)
);

-- =============================================================
-- 4. CALIFICACIÓN FINAL
-- =============================================================

DROP TABLE IF EXISTS calificacion_final_docente (
    id                  SERIAL PRIMARY KEY,
    docente_id          INT REFERENCES docentes(id),
    cuatrimestre_id     INT REFERENCES cuatrimestres(id),
    score_encuesta_estudiantil   DECIMAL(5,2),
    score_coordinacion           DECIMAL(5,2),
    score_planeacion             DECIMAL(5,2),
    score_observacion            DECIMAL(5,2),
    score_autoevaluacion         DECIMAL(5,2),
    calificacion_final  DECIMAL(5,2) GENERATED ALWAYS AS (
        COALESCE(score_encuesta_estudiantil, 0) * 0.40 +
        COALESCE(score_coordinacion, 0) * 0.25 +
        COALESCE(score_planeacion, 0) * 0.15 +
        COALESCE(score_observacion, 0) * 0.15 +
        COALESCE(score_autoevaluacion, 0) * 0.05
    ) STORED,
    categoria_final     VARCHAR(20),
    tiene_comentarios_foco_rojo  BOOLEAN DEFAULT FALSE,
    tiene_comentarios_criticos   BOOLEAN DEFAULT FALSE,
    num_instrumentos_completados SMALLINT DEFAULT 0,
    calculado_en        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(docente_id, cuatrimestre_id)
);

-- =============================================================
-- 5. ÍNDICES
-- =============================================================

CREATE INDEX idx_grupos_docente ON grupos(docente_id);
CREATE INDEX idx_grupos_cuatrimestre ON grupos(cuatrimestre_id);
CREATE INDEX idx_inscripciones_estudiante ON inscripciones(estudiante_id);
CREATE INDEX idx_encuesta_respuestas_docente ON encuesta_estudiantil_respuestas(docente_id);
CREATE INDEX idx_encuesta_respuestas_grupo ON encuesta_estudiantil_respuestas(grupo_id);
CREATE INDEX idx_evaluacion_coordinacion_docente ON evaluacion_coordinacion(docente_id);
CREATE INDEX idx_evaluacion_planeacion_docente ON evaluacion_planeacion(docente_id);
CREATE INDEX idx_observacion_clase_docente ON observacion_clase(docente_id);
CREATE INDEX idx_autoevaluacion_docente_id ON autoevaluacion_docente(docente_id);
CREATE INDEX idx_calificacion_final_docente ON calificacion_final_docente(docente_id);

-- =============================================================
-- 6. SEED DATA MÍNIMO
-- =============================================================

INSERT INTO cuatrimestres (clave, nombre, fecha_inicio, fecha_fin, activo) VALUES
    ('26-1', 'Enero–Abril 2026', '2026-01-13', '2026-04-30', true)
ON CONFLICT (clave) DO NOTHING;
-- =============================================================
-- Migración 002: Políticas RLS Centralizadas v2
-- =============================================================

-- Helper function para obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.rol_usuario(uid uuid)
RETURNS VARCHAR(20)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT rol FROM public.usuarios WHERE id = uid;
$$;

-- =============================================================
-- POLÍTICAS POR TABLA
-- =============================================================

-- cuatrimestres: lectura pública autenticados, admin gestiona
ALTER TABLE cuatrimestres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura cuatrimestres" ON cuatrimestres FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona cuatrimestres" ON cuatrimestres FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- licenciaturas
ALTER TABLE licenciaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura licenciaturas" ON licenciaturas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona licenciaturas" ON licenciaturas FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- docentes
ALTER TABLE docentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura docentes" ON docentes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona docentes" ON docentes FOR ALL USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Docente lee su perfil" ON docentes FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docentes.id AND u.rol = 'docente')
);

-- asignaturas
ALTER TABLE asignaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura asignaturas" ON asignaturas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona asignaturas" ON asignaturas FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- grupos
ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura grupos" ON grupos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona grupos" ON grupos FOR ALL USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));

-- estudiantes
ALTER TABLE estudiantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura estudiantes" ON estudiantes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona estudiantes" ON estudiantes FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');
CREATE POLICY "Estudiante lee su perfil" ON estudiantes FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = estudiantes.id AND u.rol = 'estudiante')
);

-- inscripciones
ALTER TABLE inscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura inscripciones" ON inscripciones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona inscripciones" ON inscripciones FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario lee su perfil" ON usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin gestiona usuarios" ON usuarios FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- encuesta_estudiantil_respuestas (ANÓNIMA: no expone quién respondió)
ALTER TABLE encuesta_estudiantil_respuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Estudiante inserta respuesta anónima" ON encuesta_estudiantil_respuestas
    FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) = 'estudiante');
CREATE POLICY "Staff lee respuestas" ON encuesta_estudiantil_respuestas
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Docente lee respuestas de sus grupos" ON encuesta_estudiantil_respuestas
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM grupos g JOIN usuarios u ON u.id = auth.uid()
                WHERE g.id = encuesta_estudiantil_respuestas.grupo_id AND g.docente_id = u.entidad_id AND u.rol = 'docente')
    );

-- encuesta_control_envio (PRIVADA: solo el estudiante ve si ya respondió)
ALTER TABLE encuesta_control_envio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Estudiante inserta control" ON encuesta_control_envio
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = estudiante_id AND u.rol = 'estudiante')
    );
CREATE POLICY "Estudiante lee su control" ON encuesta_control_envio
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = estudiante_id AND u.rol = 'estudiante')
    );
CREATE POLICY "Staff lee control" ON encuesta_control_envio
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));

-- evaluacion_coordinacion
ALTER TABLE evaluacion_coordinacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinador inserta evaluación" ON evaluacion_coordinacion
    FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Coordinador lee sus evaluaciones" ON evaluacion_coordinacion
    FOR SELECT USING (coordinador_id = auth.uid() OR public.rol_usuario(auth.uid()) = 'superadmin');
CREATE POLICY "Docente lee su evaluación" ON evaluacion_coordinacion
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );

-- evaluacion_planeacion
ALTER TABLE evaluacion_planeacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Evaluador inserta planeación" ON evaluacion_planeacion
    FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Staff lee planeación" ON evaluacion_planeacion
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Docente lee su planeación" ON evaluacion_planeacion
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );

-- observacion_clase
ALTER TABLE observacion_clase ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Observador inserta observación" ON observacion_clase
    FOR INSERT WITH CHECK (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Staff lee observaciones" ON observacion_clase
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Docente lee su observación" ON observacion_clase
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );

-- autoevaluacion_docente
ALTER TABLE autoevaluacion_docente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Docente inserta autoevaluación" ON autoevaluacion_docente
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );
CREATE POLICY "Docente lee su autoevaluación" ON autoevaluacion_docente
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );
CREATE POLICY "Staff lee autoevaluaciones" ON autoevaluacion_docente
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));

-- calificacion_final_docente
ALTER TABLE calificacion_final_docente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lee calificaciones" ON calificacion_final_docente
    FOR SELECT USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
CREATE POLICY "Docente lee su calificación" ON calificacion_final_docente
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente')
    );
CREATE POLICY "Admin gestiona calificaciones" ON calificacion_final_docente
    FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');
-- Migración 006: Catálogo de Ofertas Académicas
-- Tabla reutilizable en todos los formularios

DROP TABLE IF EXISTS IF NOT EXISTS ofertas_academicas (
 CASCADE;
CREATE TABLE IF NOT EXISTS      SERIAL PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL UNIQUE,
  activa  BOOLEAN DEFAULT TRUE
);

ALTER TABLE ofertas_academicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura ofertas" ON ofertas_academicas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona ofertas" ON ofertas_academicas FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

-- Seed data: las 15 carreras del documento
INSERT INTO ofertas_academicas (nombre) VALUES
  ('Arquitectura'), ('Administración de Empresas'), ('Administración de Empresas Turísticas'),
  ('Mercadotecnia'), ('Sistemas Computacionales'), ('Enfermería'), ('Nutrición'),
  ('Contaduría'), ('Derecho'), ('Pedagogía'), ('Criminología'), ('Comercio Internacional'),
  ('Diseño Gráfico Digital'), ('Inglés'), ('Otros')
ON CONFLICT (nombre) DO NOTHING;
-- Migración 007: Catálogos de Campus y Turnos

DROP TABLE IF EXISTS IF NOT EXISTS campus (
 CASCADE;
CREATE TABLE IF NOT EXISTS      SERIAL PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL UNIQUE,
  activo  BOOLEAN DEFAULT TRUE
);

ALTER TABLE campus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura campus" ON campus FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona campus" ON campus FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

INSERT INTO campus (nombre) VALUES
  ('Tecnológico Universitario Tuxtla'),
  ('Tecnológico Universitario Playacar'),
  ('Facultad de Ciencias de la Salud')
ON CONFLICT (nombre) DO NOTHING;

-- Turnos
DROP TABLE IF EXISTS IF NOT EXISTS turnos (
 CASCADE;
CREATE TABLE IF NOT EXISTS      SERIAL PRIMARY KEY,
  nombre  VARCHAR(50) NOT NULL UNIQUE,
  activo  BOOLEAN DEFAULT TRUE
);

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura turnos" ON turnos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin gestiona turnos" ON turnos FOR ALL USING (public.rol_usuario(auth.uid()) = 'superadmin');

INSERT INTO turnos (nombre) VALUES
  ('Matutino'), ('Vespertino'), ('Mixto'), ('Virtual')
ON CONFLICT (nombre) DO NOTHING;
