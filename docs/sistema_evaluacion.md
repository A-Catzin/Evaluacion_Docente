# Sistema de Evaluación Docente 360° — Especificación Técnica Completa
> Tecnológico Universitario Playacar
> Cuatrimestre de referencia: 26-3

> ⚠️ **NOTA**: Este documento es la especificación original (v1). La implementación actual (v2) usa una fórmula actualizada y PostgreSQL/Supabase. Consultar `docs/contexto.md`, `docs/requerimientos.md` y `docs/roadmap.md` para la versión vigente.

## Fórmula actualizada (v2 — vigente)
```
Nota Final = (EE × 0.35) + (CA × 0.20) + (PD × 0.15) + (OC × 0.25) + (AE × 0.05)
```
La fórmula original v1 era: `(EE × 0.40) + (CA × 0.25) + (PD × 0.15) + (OC × 0.15) + (AE × 0.05)` — ver sección histórica abajo.

---

## 📐 Visión General del Sistema

Este documento describe la arquitectura completa del **Sistema de Evaluación Docente 360°**. Su propósito es guiar a la IA en la construcción de dashboards, páginas por rol, estructura de base de datos y lógica de calificación. Todo parte de un modelo de evaluación que integra **5 instrumentos** para obtener una calificación final ponderada por docente.

---

## 🧮 Modelo de Calificación: Cómo se Obtiene la Nota Final

La calificación final de cada docente se calcula con la siguiente fórmula ponderada (escala 0–100):

```
Nota Final = (EE × 0.40) + (CA × 0.25) + (PD × 0.15) + (OC × 0.15) + (AE × 0.05)
```

| Instrumento                         | Clave | Peso | Escala Original | Normalización a 100 |
|-------------------------------------|-------|------|-----------------|----------------------|
| Encuesta Estudiantil                | EE    | 40%  | 1–6 niveles     | (puntos/6) × 100     |
| Evaluación por Coordinación Académica | CA  | 25%  | 0–75 puntos     | (puntos/75) × 100    |
| Planeación Docente                  | PD    | 15%  | 0–22 puntos     | (puntos/22) × 100    |
| Observación de Clase                | OC    | 15%  | 0–10 puntos     | (puntos/10) × 100    |
| Auto-evaluación Docente             | AE    | 5%   | 0–1 (normaliz.) | puntos × 100         |

> 📜 **FÓRMULA HISTÓRICA (v1 — NO VIGENTE)**:
> ```
> Nota Final = (EE × 0.40) + (CA × 0.25) + (PD × 0.15) + (OC × 0.15) + (AE × 0.05)
> ```
> Reemplazada en v2 por 35/20/15/25/5.

### Rangos de Calificación Final (vigente v2)

| Rango     | Categoría     | Color sugerido |
|-----------|---------------|----------------|
| 90 – 100  | Sobresaliente | `#22c55e` verde |
| 80 – 89   | Distinguido   | `#3b82f6` azul  |
| 70 – 79   | Bueno         | `#a855f7` morado |
| 60 – 69   | Aprobado      | `#f59e0b` amarillo |
| 50 – 59   | A mejorar     | `#f97316` naranja |
| 0 – 49    | Insuficiente  | `#ef4444` rojo  |

---

## 🗄️ Base de Datos — Esquema Requerido

> **Instrucción para la IA:** Modificar o crear las siguientes tablas en la base de datos existente. Respetar nombres de campos y tipos. Agregar índices en campos de búsqueda frecuente (`docente_id`, `cuatrimestre_id`, `grupo_id`).

### Tabla: `cuatrimestres`
```sql
CREATE TABLE cuatrimestres (
  id              SERIAL PRIMARY KEY,
  clave           VARCHAR(10) NOT NULL,        -- ej: "26-1"
  nombre          VARCHAR(50) NOT NULL,        -- ej: "Enero–Abril 2026"
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabla: `licenciaturas`
```sql
CREATE TABLE licenciaturas (
  id              SERIAL PRIMARY KEY,
  clave           VARCHAR(10) NOT NULL,
  nombre          VARCHAR(100) NOT NULL,
  facultad        VARCHAR(100),
  activa          BOOLEAN DEFAULT TRUE
);
```

### Tabla: `docentes`
```sql
CREATE TABLE docentes (
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
```

### Tabla: `asignaturas`
```sql
CREATE TABLE asignaturas (
  id              SERIAL PRIMARY KEY,
  clave           VARCHAR(20) NOT NULL,
  nombre          VARCHAR(150) NOT NULL,
  licenciatura_id INT REFERENCES licenciaturas(id),
  cuatrimestre_num INT,                        -- qué cuatrimestre de la carrera
  creditos        INT DEFAULT 5,
  activa          BOOLEAN DEFAULT TRUE
);
```

### Tabla: `grupos`
```sql
CREATE TABLE grupos (
  id              SERIAL PRIMARY KEY,
  clave           VARCHAR(20) NOT NULL,        -- ej: "A", "B", "101"
  asignatura_id   INT REFERENCES asignaturas(id),
  docente_id      INT REFERENCES docentes(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  num_alumnos     INT DEFAULT 0,
  activo          BOOLEAN DEFAULT TRUE
);
```

### Tabla: `estudiantes`
```sql
CREATE TABLE estudiantes (
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
```

### Tabla: `inscripciones`
```sql
CREATE TABLE inscripciones (
  id              SERIAL PRIMARY KEY,
  estudiante_id   INT REFERENCES estudiantes(id),
  grupo_id        INT REFERENCES grupos(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  fecha           DATE,
  UNIQUE(estudiante_id, grupo_id)
);
```

---

### 📊 Instrumento 1: Encuesta Estudiantil

#### Tabla: `encuesta_estudiantil_respuestas`
```sql
CREATE TABLE encuesta_estudiantil_respuestas (
  id                  SERIAL PRIMARY KEY,
  estudiante_id       INT REFERENCES estudiantes(id),
  docente_id          INT REFERENCES docentes(id),
  grupo_id            INT REFERENCES grupos(id),
  cuatrimestre_id     INT REFERENCES cuatrimestres(id),
  fecha_respuesta     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Calidad general (1=Reprobado, 2=Insuficiente, 3=Aprobado, 4=Bueno, 5=Distinguido, 6=Sobresaliente)
  calidad_general     TINYINT NOT NULL CHECK (calidad_general BETWEEN 1 AND 6),
  -- Ítems Likert (1=Total desacuerdo, 2=Desacuerdo, 3=De acuerdo, 4=Fuertemente de acuerdo)
  item_plan_estudio          TINYINT CHECK (item_plan_estudio BETWEEN 1 AND 4),
  item_trato_respeto         TINYINT CHECK (item_trato_respeto BETWEEN 1 AND 4),
  item_asistencia            TINYINT CHECK (item_asistencia BETWEEN 1 AND 4),
  item_puntualidad           TINYINT CHECK (item_puntualidad BETWEEN 1 AND 4),
  item_participacion         TINYINT CHECK (item_participacion BETWEEN 1 AND 4),
  item_dominio_materia       TINYINT CHECK (item_dominio_materia BETWEEN 1 AND 4),
  item_plataforma_moodle     TINYINT CHECK (item_plataforma_moodle BETWEEN 1 AND 4),
  item_pensamiento_critico   TINYINT CHECK (item_pensamiento_critico BETWEEN 1 AND 4),
  item_desafio_intelectual   TINYINT CHECK (item_desafio_intelectual BETWEEN 1 AND 4),
  item_claridad_objetivos    TINYINT CHECK (item_claridad_objetivos BETWEEN 1 AND 4),
  item_lecturas_aprendizaje  TINYINT CHECK (item_lecturas_aprendizaje BETWEEN 1 AND 4),
  item_respeto_reglas        TINYINT CHECK (item_respeto_reglas BETWEEN 1 AND 4),
  item_interes_materia       TINYINT CHECK (item_interes_materia BETWEEN 1 AND 4),
  item_apoyos_didacticos     TINYINT CHECK (item_apoyos_didacticos BETWEEN 1 AND 4),
  item_actitudes_valores     TINYINT CHECK (item_actitudes_valores BETWEEN 1 AND 4),
  item_retroalimentacion     TINYINT CHECK (item_retroalimentacion BETWEEN 1 AND 4),
  item_criterios_evaluacion  TINYINT CHECK (item_criterios_evaluacion BETWEEN 1 AND 4),
  item_receptividad          TINYINT CHECK (item_receptividad BETWEEN 1 AND 4),
  -- Comentarios abiertos
  comentario_abierto         TEXT,
  -- Clasificación automática del comentario (asignada por IA o moderador)
  -- 'excelente' | 'neutro' | 'a_mejorar' | 'critico' | 'foco_rojo'
  clasificacion_comentario   ENUM('excelente','neutro','a_mejorar','critico','foco_rojo') DEFAULT 'neutro',
  anonimo                    BOOLEAN DEFAULT TRUE
);
```

#### Vista: `encuesta_resumen_docente` (calcular en consulta o vista materializada)
```sql
-- Puntuación normalizada EE para fórmula final
-- EE_score = (AVG(calidad_general) / 6) * 100
-- Desglosar también porcentajes por nivel para el dashboard
```

---

### 📊 Instrumento 2: Evaluación por Coordinación Académica

#### Tabla: `evaluacion_coordinacion`
```sql
CREATE TABLE evaluacion_coordinacion (
  id                  SERIAL PRIMARY KEY,
  docente_id          INT REFERENCES docentes(id),
  coordinador_id      INT REFERENCES usuarios(id),   -- quien evalúa
  cuatrimestre_id     INT REFERENCES cuatrimestres(id),
  fecha_evaluacion    DATE NOT NULL,
  -- Puntuación total sobre 75
  puntos_obtenidos    DECIMAL(5,2) NOT NULL CHECK (puntos_obtenidos BETWEEN 0 AND 75),
  -- Categoría calculada automáticamente
  -- 60-75=Excelente, 45-59=Buena, 30-44=Aceptable, 15-29=Deficiente, 0-14=Insuficiente
  categoria           ENUM('excelente','buena','aceptable','deficiente','insuficiente') NOT NULL,
  -- Desglose por dimensiones (cada una sobre puntos variables, total = 75)
  dim_planificacion        DECIMAL(4,2),
  dim_estrategias          DECIMAL(4,2),
  dim_evaluacion           DECIMAL(4,2),
  dim_clima_aula           DECIMAL(4,2),
  dim_comunicacion         DECIMAL(4,2),
  dim_cumplimiento         DECIMAL(4,2),
  observaciones            TEXT,
  -- score normalizado para fórmula: (puntos/75)*100
  score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS ((puntos_obtenidos / 75) * 100) STORED
);
```

---

### 📊 Instrumento 3: Planeación Docente

#### Tabla: `evaluacion_planeacion`
```sql
CREATE TABLE evaluacion_planeacion (
  id                      SERIAL PRIMARY KEY,
  docente_id              INT REFERENCES docentes(id),
  evaluador_id            INT REFERENCES usuarios(id),
  cuatrimestre_id         INT REFERENCES cuatrimestres(id),
  asignatura_id           INT REFERENCES asignaturas(id),
  fecha_evaluacion        DATE NOT NULL,
  -- 11 criterios, cada uno calificado 0–2 (0=No cumple, 1=Cumple parcial, 2=Cumple total)
  criterio_elementos_curriculares    TINYINT CHECK (criterio_elementos_curriculares BETWEEN 0 AND 2),
  criterio_fase_inicio               TINYINT CHECK (criterio_fase_inicio BETWEEN 0 AND 2),
  criterio_fase_desarrollo           TINYINT CHECK (criterio_fase_desarrollo BETWEEN 0 AND 2),
  criterio_fase_cierre               TINYINT CHECK (criterio_fase_cierre BETWEEN 0 AND 2),
  criterio_caracteristicas_act       TINYINT CHECK (criterio_caracteristicas_act BETWEEN 0 AND 2),
  criterio_estrategias_didacticas    TINYINT CHECK (criterio_estrategias_didacticas BETWEEN 0 AND 2),
  criterio_recursos_didacticos       TINYINT CHECK (criterio_recursos_didacticos BETWEEN 0 AND 2),
  criterio_organizacion_grupo        TINYINT CHECK (criterio_organizacion_grupo BETWEEN 0 AND 2),
  criterio_estrategias_evaluacion    TINYINT CHECK (criterio_estrategias_evaluacion BETWEEN 0 AND 2),
  criterio_productos                 TINYINT CHECK (criterio_productos BETWEEN 0 AND 2),
  criterio_bibliografia              TINYINT CHECK (criterio_bibliografia BETWEEN 0 AND 2),
  -- Total automático (suma de criterios, máx 22)
  puntos_totales          TINYINT GENERATED ALWAYS AS (
    criterio_elementos_curriculares + criterio_fase_inicio + criterio_fase_desarrollo +
    criterio_fase_cierre + criterio_caracteristicas_act + criterio_estrategias_didacticas +
    criterio_recursos_didacticos + criterio_organizacion_grupo + criterio_estrategias_evaluacion +
    criterio_productos + criterio_bibliografia
  ) STORED,
  -- 20-22=Excelente, 15-19=Bueno, 10-14=Regular, 0-9=Insuficiente
  categoria               ENUM('excelente','bueno','regular','insuficiente'),
  comentarios             TEXT,
  score_normalizado       DECIMAL(5,2) GENERATED ALWAYS AS ((puntos_totales / 22.0) * 100) STORED
);
```

---

### 📊 Instrumento 4: Observación de Clase

#### Tabla: `observacion_clase`
```sql
CREATE TABLE observacion_clase (
  id                  SERIAL PRIMARY KEY,
  docente_id          INT REFERENCES docentes(id),
  observador_id       INT REFERENCES usuarios(id),
  cuatrimestre_id     INT REFERENCES cuatrimestres(id),
  grupo_id            INT REFERENCES grupos(id),
  fecha_observacion   DATE NOT NULL,
  hora_inicio         TIME,
  hora_fin            TIME,
  -- Puntuación total sobre 10
  puntuacion_total    DECIMAL(4,2) NOT NULL CHECK (puntuacion_total BETWEEN 0 AND 10),
  -- Desglose de dimensiones observadas (cada una sobre 10, promediadas)
  dim_inicio_clase         DECIMAL(3,2),   -- saludo, encuadre, motivación
  dim_desarrollo           DECIMAL(3,2),   -- estrategias, ritmo, claridad
  dim_cierre               DECIMAL(3,2),   -- síntesis, retroalimentación
  dim_clima_aula           DECIMAL(3,2),   -- respeto, participación
  dim_uso_recursos         DECIMAL(3,2),   -- materiales, tecnología
  -- Categoría: 9-10=Ejemplar, 7-8.9=Eficaz, 0-6.9=Por validar
  categoria           ENUM('ejemplar','eficaz','por_validar') NOT NULL,
  observaciones       TEXT,
  recomendaciones     TEXT,
  -- score normalizado para fórmula: (puntuacion/10)*100
  score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS (puntuacion_total * 10) STORED
);
```

---

### 📊 Instrumento 5: Auto-evaluación Docente

#### Tabla: `autoevaluacion_docente`
```sql
CREATE TABLE autoevaluacion_docente (
  id                  SERIAL PRIMARY KEY,
  docente_id          INT REFERENCES docentes(id),
  cuatrimestre_id     INT REFERENCES cuatrimestres(id),
  fecha_respuesta     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Ítems de auto-evaluación (1=No aplico/No cumplí, 2=Bueno, 3=Muy Bueno)
  ae_planificacion_clases      TINYINT CHECK (ae_planificacion_clases BETWEEN 1 AND 3),
  ae_dominio_contenido         TINYINT CHECK (ae_dominio_contenido BETWEEN 1 AND 3),
  ae_estrategias_didacticas    TINYINT CHECK (ae_estrategias_didacticas BETWEEN 1 AND 3),
  ae_retroalimentacion         TINYINT CHECK (ae_retroalimentacion BETWEEN 1 AND 3),
  ae_puntualidad_asistencia    TINYINT CHECK (ae_puntualidad_asistencia BETWEEN 1 AND 3),
  ae_uso_plataforma            TINYINT CHECK (ae_uso_plataforma BETWEEN 1 AND 3),
  ae_trato_estudiantes         TINYINT CHECK (ae_trato_estudiantes BETWEEN 1 AND 3),
  ae_cumplimiento_programa     TINYINT CHECK (ae_cumplimiento_programa BETWEEN 1 AND 3),
  ae_actualizacion_profesional TINYINT CHECK (ae_actualizacion_profesional BETWEEN 1 AND 3),
  ae_evaluacion_aprendizaje    TINYINT CHECK (ae_evaluacion_aprendizaje BETWEEN 1 AND 3),
  -- Promedio normalizado (score 0–1, luego ×100 para fórmula)
  promedio_raw        DECIMAL(4,3) GENERATED ALWAYS AS (
    (ae_planificacion_clases + ae_dominio_contenido + ae_estrategias_didacticas +
     ae_retroalimentacion + ae_puntualidad_asistencia + ae_uso_plataforma +
     ae_trato_estudiantes + ae_cumplimiento_programa + ae_actualizacion_profesional +
     ae_evaluacion_aprendizaje) / 30.0
  ) STORED,
  score_normalizado   DECIMAL(5,2) GENERATED ALWAYS AS (
    ((ae_planificacion_clases + ae_dominio_contenido + ae_estrategias_didacticas +
      ae_retroalimentacion + ae_puntualidad_asistencia + ae_uso_plataforma +
      ae_trato_estudiantes + ae_cumplimiento_programa + ae_actualizacion_profesional +
      ae_evaluacion_aprendizaje) / 30.0) * 100
  ) STORED,
  -- 'muy_bueno' | 'bueno' | 'no_aplico'
  categoria           ENUM('muy_bueno','bueno','no_aplico'),
  reflexion_personal  TEXT   -- campo abierto opcional
);
```

---

### 🏆 Tabla: `calificacion_final_docente`
```sql
-- Esta tabla se calcula/actualiza al cerrar el cuatrimestre
CREATE TABLE calificacion_final_docente (
  id                  SERIAL PRIMARY KEY,
  docente_id          INT REFERENCES docentes(id),
  cuatrimestre_id     INT REFERENCES cuatrimestres(id),
  -- Scores individuales normalizados (0–100)
  score_encuesta_estudiantil   DECIMAL(5,2),   -- peso 40%
  score_coordinacion           DECIMAL(5,2),   -- peso 25%
  score_planeacion             DECIMAL(5,2),   -- peso 15%
  score_observacion            DECIMAL(5,2),   -- peso 15%
  score_autoevaluacion         DECIMAL(5,2),   -- peso 5%
  -- Calificación final ponderada
  calificacion_final  DECIMAL(5,2) GENERATED ALWAYS AS (
    (score_encuesta_estudiantil * 0.35  -- actualizado v2) +
    (score_coordinacion * 0.20  -- actualizado v2) +
    (score_planeacion * 0.15) +
    (score_observacion * 0.25  -- actualizado v2) +
    (score_autoevaluacion * 0.05)
  ) STORED,
  -- Categoría final calculada
  categoria_final     VARCHAR(20),  -- actualizar via trigger o aplicación
  -- Flags de alertas
  tiene_comentarios_foco_rojo  BOOLEAN DEFAULT FALSE,
  tiene_comentarios_criticos   BOOLEAN DEFAULT FALSE,
  num_instrumentos_completados TINYINT DEFAULT 0,  -- de 5 posibles
  calculado_en        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(docente_id, cuatrimestre_id)
);
```

### Tabla: `usuarios` (sistema de autenticación/roles)
```sql
CREATE TABLE usuarios (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(150) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  -- rol: 'superadmin' | 'coordinador' | 'docente' | 'estudiante'
  rol             ENUM('superadmin','coordinador','docente','estudiante') NOT NULL,
  entidad_id      INT,   -- docente_id o estudiante_id según el rol
  activo          BOOLEAN DEFAULT TRUE,
  ultimo_acceso   TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🖥️ Páginas y Roles del Sistema

El sistema tiene **4 roles** con dashboards y páginas completamente distintos.

---

## 👑 ROL: Super Admin / Dirección Académica

> Acceso total. Ve datos de toda la institución. Puede configurar el sistema.

### Dashboard Principal (`/admin/dashboard`)

**Sección 1 — KPIs Institucionales (tarjetas superiores)**
- Total docentes evaluados / Total docentes activos
- Promedio institucional de calificación final (con indicador de tendencia vs cuatrimestre anterior)
- % docentes en categoría Sobresaliente o Distinguido
- % docentes con focos rojos activos (alerta visual prominente)
- Número de instrumentos pendientes de completar

**Sección 2 — Distribución General**
- Gráfica de donut: distribución por categoría final (Sobresaliente/Distinguido/Bueno/Aprobado/A mejorar/Insuficiente)
- Gráfica de barras comparativa: promedio por instrumento (los 5 instrumentos side-by-side)
- Mapa de calor: docentes vs instrumentos (verde=completado, rojo=faltante)

**Sección 3 — Ranking de Docentes**
- Tabla con: foto, nombre, calificación final, badge de categoría, 5 mini-barras (una por instrumento), focos de alerta
- Ordenable y filtrable por licenciatura, cuatrimestre, categoría
- Click en fila → perfil completo del docente

**Sección 4 — Alertas y Seguimiento**
- Lista de docentes con comentarios "foco rojo" sin atender
- Docentes con instrumentos incompletos
- Docentes con caída significativa vs cuatrimestre anterior

**Sección 5 — Comparativa Histórica**
- Gráfica de líneas: evolución del promedio institucional por cuatrimestre
- Selector de docente individual para ver su trayectoria

---

### Páginas adicionales del Admin

#### `/admin/docentes` — Gestión de Docentes
- Tabla completa de docentes con búsqueda y filtros
- Botón: Agregar nuevo docente (modal con formulario)
- Click en docente → `/admin/docentes/:id`

#### `/admin/docentes/:id` — Perfil Detallado del Docente
- Header: foto, nombre, licenciatura, num. empleado, email
- **Tarjetas de score por instrumento** (las 5, con valor numérico y barra)
- **Calificación final destacada** con badge de categoría
- **Gráfica radar** con los 5 instrumentos (para ver fortalezas/debilidades visualmente)
- **Histórico cuatrimestral** (gráfica de líneas de la calificación final)
- **Sección de comentarios clasificados** (pestañas: Excelentes / A mejorar / Críticos / Foco rojo)
- **Desglose de Encuesta Estudiantil**: los 18 ítems con % de acuerdo/desacuerdo en barras horizontales
- **Recomendaciones generadas** (basadas en los focos identificados)
- Botón: Descargar reporte PDF del docente

#### `/admin/instrumentos` — Estado de Captura
- Tabla: instrumento × docente × cuatrimestre → estado (Pendiente / En proceso / Completado)
- Filtros por instrumento, licenciatura, cuatrimestre

#### `/admin/cuatrimestres` — Gestión de Períodos
- Lista de cuatrimestres con fecha de inicio/fin y estado (activo/cerrado)
- Botón: Cerrar cuatrimestre (dispara cálculo de calificaciones finales)
- Botón: Abrir nuevo cuatrimestre

#### `/admin/configuracion` — Configuración del Sistema
- Editar pesos de la fórmula ponderada (los 5 instrumentos, deben sumar 100%)
- Editar rangos de categorías finales
- Editar ítems de cada instrumento
- Gestión de usuarios y roles

---

## 🎓 ROL: Coordinador Académico

> Ve y evalúa solo los docentes de su licenciatura/área asignada. Captura datos de los instrumentos 2, 3 y 4.

### Dashboard Principal (`/coordinador/dashboard`)

**Sección 1 — Resumen de mi área**
- Total docentes bajo su coordinación
- Promedio de calificación de su área (vs promedio institucional)
- Docentes con alertas activas (focos rojos/críticos)
- Instrumentos pendientes de capturar

**Sección 2 — Estado por Docente**
- Tarjetas visuales por docente (foto, nombre, score actual, semáforo de alertas, % instrumentos completados)
- Click → perfil del docente (vista coordinador)

**Sección 3 — Pendientes de Evaluación**
- Lista priorizada: docentes sin observación de clase, sin evaluación de planeación o sin evaluación de coordinación
- Botones de acción rápida: "Evaluar ahora"

---

### Páginas adicionales del Coordinador

#### `/coordinador/docentes/:id` — Perfil Docente (vista coordinador)
- Igual que la vista admin pero sin opciones de configuración
- Puede ver todos los datos de ese docente
- Puede agregar/editar evaluaciones que le corresponden

#### `/coordinador/captura/coordinacion` — Captura: Evaluación por Coordinación
- Selector: Docente + Cuatrimestre
- Formulario con las dimensiones (campos numéricos 0–75 con indicaciones)
- Total calculado en tiempo real
- Botón guardar / guardar borrador

#### `/coordinador/captura/planeacion` — Captura: Planeación Docente
- Selector: Docente + Asignatura + Cuatrimestre
- Los 11 criterios con selector (No cumple / Cumple parcial / Cumple total)
- Descripción breve de cada criterio al hacer hover
- Campo de comentarios por criterio
- Total calculado en tiempo real
- Vista previa antes de guardar

#### `/coordinador/captura/observacion` — Captura: Observación de Clase
- Selector: Docente + Grupo + Fecha
- Las 5 dimensiones con calificación 0–10 y slider visual
- Calificación total calculada automáticamente
- Asignación de categoría automática (Ejemplar / Eficaz / Por validar)
- Campo: observaciones generales + recomendaciones

#### `/coordinador/reportes` — Reportes de su Área
- Comparativa de docentes de su área en tabla ordenable
- Exportar a Excel o PDF
- Filtros por cuatrimestre, asignatura, categoría

---

## 👨‍🏫 ROL: Docente

> Solo ve su propia información. Responde la auto-evaluación. Ve sus resultados cuando el cuatrimestre está cerrado.

### Dashboard Principal (`/docente/dashboard`)

**Sección 1 — Mi Evaluación del Cuatrimestre Actual**
- Selector de cuatrimestre (si tiene historial)
- Si el cuatrimestre está **abierto**: banner informativo "Los resultados se publicarán al cierre del cuatrimestre"
- Si está **cerrado**: muestra la calificación final con badge de categoría y animación de revelación

**Sección 2 — Mis Scores (cuando cuatrimestre cerrado)**
- 5 tarjetas: una por instrumento con score normalizado y barra de progreso
- Gráfica radar comparando sus 5 scores
- Comparativa anónima: "Tu posición en el área" (percentil, sin revelar otros docentes)

**Sección 3 — Retroalimentación Estudiantil**
- Nube de palabras de comentarios positivos
- Resumen de comentarios "a mejorar" (sin identificar al estudiante)
- Desglose de los 18 ítems de la encuesta en barras horizontales

**Sección 4 — Mi Historial**
- Gráfica de líneas: calificación final por cuatrimestre
- Tabla comparativa cuatrimestre a cuatrimestre

**Sección 5 — Recomendaciones Personalizadas**
- Basadas en sus puntos más bajos: sugerencias de mejora concretas por área

---

### Páginas adicionales del Docente

#### `/docente/autoevaluacion` — Responder Auto-evaluación
- Solo disponible en cuatrimestre activo y dentro de fechas configuradas
- Los 10 ítems con escala visual (No apliqué / Bueno / Muy Bueno)
- Descripción de cada ítem
- Campo de reflexión personal (opcional)
- Confirmación antes de enviar (no editable una vez enviado)
- Si ya fue respondida: vista de solo lectura con sus respuestas

#### `/docente/mis-grupos` — Mis Grupos y Asignaturas
- Lista de grupos asignados en el cuatrimestre actual
- Indicador: si la encuesta estudiantil ya está disponible para cada grupo
- Número de respuestas recibidas (sin datos individuales)

---

## 🎒 ROL: Estudiante

> Solo responde la encuesta estudiantil. Ve confirmación de envío. No ve calificaciones del docente.

### Dashboard Principal (`/estudiante/dashboard`)

**Sección 1 — Encuestas Pendientes**
- Tarjetas por cada grupo/asignatura que tiene pendiente de evaluar
- Indicador visual de urgencia si queda poco tiempo
- Estado: Pendiente / Respondida

**Sección 2 — Encuestas Completadas**
- Lista de encuestas ya enviadas con fecha y confirmación

---

### Páginas adicionales del Estudiante

#### `/estudiante/encuesta/:grupo_id` — Responder Encuesta
- **Paso 1 — Calidad General**: pregunta visual con 6 opciones ilustradas (Reprobado → Sobresaliente)
- **Paso 2 — Ítems Específicos**: los 18 ítems en formato de tarjetas con escala de 4 niveles
  - Barra de progreso en la parte superior (18 preguntas)
  - Agrupados por bloque (Gestión / Práctica Pedagógica / Experiencia de Aprendizaje)
  - Botones visuales (no radio buttons genéricos)
- **Paso 3 — Comentarios Abiertos**: campo de texto libre con contador de caracteres
  - Recordatorio de anonimato
- **Paso 4 — Confirmación**: resumen de sus respuestas antes de enviar
- Completamente anónima (no guardar relación estudiante → respuesta específica en producción, solo el grupo)
- Responsive: diseñada para completarse desde móvil

---

## 🎨 Guía de Diseño de Interfaces

> **Instrucción para la IA:** Seguir estas especificaciones de diseño al construir cada página.

### Paleta de Colores del Sistema
```css
:root {
  /* Primarios institucionales */
  --color-primary: #1e3a5f;        /* Azul TUP oscuro */
  --color-primary-light: #2d5a8e;  /* Azul TUP medio */
  --color-accent: #e8a020;         /* Dorado TUP */

  /* Fondo y superficies */
  --color-bg: #f5f7fa;
  --color-surface: #ffffff;
  --color-surface-2: #eef2f7;

  /* Categorías de evaluación */
  --color-sobresaliente: #22c55e;
  --color-distinguido: #3b82f6;
  --color-bueno: #a855f7;
  --color-aprobado: #f59e0b;
  --color-a-mejorar: #f97316;
  --color-insuficiente: #ef4444;

  /* Alertas de comentarios */
  --color-foco-rojo: #dc2626;
  --color-critico: #f97316;
  --color-a-mejorar-com: #f59e0b;
  --color-neutro: #6b7280;
  --color-excelente-com: #22c55e;
}
```

### Componentes Clave a Construir

1. **`<ScoreCard />`** — Tarjeta de score por instrumento: ícono, nombre instrumento, valor numérico grande, barra de progreso con color según categoría, badge de categoría.

2. **`<RadarChart />`** — Gráfica radar con los 5 instrumentos. Usar Recharts o Chart.js.

3. **`<CommentBadge />`** — Badge de comentario con color según clasificación (foco rojo rojo, crítico naranja, etc.)

4. **`<DocenteCard />`** — Tarjeta de docente para listados: foto/avatar, nombre, calificación final destacada, mini-barras de los 5 instrumentos, indicadores de alerta.

5. **`<InstrumentoForm />`** — Formulario de captura con validación en tiempo real, cálculo automático del total y preview del resultado.

6. **`<EncuestaStep />`** — Paso de encuesta estudiantil con botones visuales grandes (apto para móvil).

7. **`<CalificacionFinalBadge />`** — Badge grande y llamativo con la calificación final y categoría, usado en el perfil del docente.

8. **`<AlertaFocoRojo />`** — Banner prominente con los comentarios de foco rojo para coordinadores/admin.

### Navegación por Rol

```
SuperAdmin:   Sidebar permanente con íconos + labels
Coordinador:  Sidebar colapsable (más limpio para captura de datos)
Docente:      Top navigation + cards (más simple)
Estudiante:   Pantalla completa de encuesta (sin distracciones, tipo wizard)
```

---

## 🔒 Reglas de Negocio Importantes

1. **Anonimato**: La encuesta estudiantil es anónima. Solo guardar `grupo_id` y `cuatrimestre_id`, nunca `estudiante_id` vinculado a respuestas individuales. El sistema solo puede verificar si el estudiante *ya respondió* (tabla separada de control).

2. **Ventana de encuesta**: La encuesta estudiantil solo está disponible en las fechas configuradas por el admin. Fuera de ese rango: pantalla de "La encuesta no está disponible en este momento".

3. **Cierre de cuatrimestre**: Solo el admin puede cerrar un cuatrimestre. Al cerrar, se dispara el cálculo de `calificacion_final_docente` para todos los docentes con al menos 1 instrumento completado.

4. **Instrumentos mínimos**: Un docente necesita al menos la Encuesta Estudiantil completada para tener calificación. Si falta algún instrumento, su peso se redistribuye proporcionalmente entre los disponibles (o se marca como "calificación parcial").

5. **Visibilidad de resultados**: Los docentes solo pueden ver sus resultados cuando el cuatrimestre está marcado como cerrado. Los coordinadores pueden ver en tiempo real.

6. **Comentarios foco rojo**: Cualquier comentario clasificado como "foco rojo" debe generar una notificación automática al coordinador correspondiente.

7. **Edición de capturas**: Los coordinadores pueden editar una evaluación hasta que el cuatrimestre se cierre. Después, solo lectura (con opción de apelación gestionada por admin).

---

## 📁 Estructura de Rutas Sugerida

```
/
├── /login
├── /admin/
│   ├── dashboard
│   ├── docentes
│   ├── docentes/:id
│   ├── instrumentos
│   ├── cuatrimestres
│   └── configuracion
├── /coordinador/
│   ├── dashboard
│   ├── docentes/:id
│   ├── captura/coordinacion
│   ├── captura/planeacion
│   ├── captura/observacion
│   └── reportes
├── /docente/
│   ├── dashboard
│   ├── autoevaluacion
│   └── mis-grupos
└── /estudiante/
    ├── dashboard
    └── encuesta/:grupo_id
```

---

## ✅ Checklist de Implementación para la IA

- [ ] Crear/migrar todas las tablas de base de datos descritas
- [ ] Implementar triggers o lógica de aplicación para calcular `calificacion_final_docente`
- [ ] Implementar sistema de autenticación con los 4 roles
- [ ] Construir guards/middlewares de rutas por rol
- [ ] Dashboard SuperAdmin con todos los KPIs y gráficas
- [ ] Dashboard Coordinador con estado de captura
- [ ] Formularios de captura: Coordinación, Planeación, Observación
- [ ] Dashboard Docente con resultados (bloqueado hasta cierre de cuatrimestre)
- [ ] Formulario de Auto-evaluación Docente
- [ ] Encuesta Estudiantil tipo wizard (4 pasos, mobile-first)
- [ ] Dashboard Estudiante (pendientes/completadas)
- [ ] Sistema de notificaciones para focos rojo
- [ ] Exportación de reportes a PDF
- [ ] Implementar clasificación automática de comentarios (integración con IA opcional)

---

*Documento generado como especificación técnica para el Sistema de Evaluación Docente 360°*
*TUP*