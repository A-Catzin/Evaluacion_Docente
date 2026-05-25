## Table `asignaturas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `clave` | `varchar` |  Unique |
| `nombre` | `varchar` |  |
| `licenciatura_id` | `int4` |  Nullable |
| `cuatrimestre_num` | `int4` |  Nullable |
| `creditos` | `int4` |  Nullable |
| `activa` | `bool` |  Nullable |
| `oferta_academica_id` | `int4` |  Nullable |
| `modalidad` | `varchar` |  Nullable |

## Table `autodiagnosticos`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `r1` | `int2` |  Nullable |
| `r2` | `int2` |  Nullable |
| `r3` | `int2` |  Nullable |
| `r4` | `int2` |  Nullable |
| `r5` | `int2` |  Nullable |
| `r6` | `int2` |  Nullable |
| `r7` | `int2` |  Nullable |
| `r8` | `int2` |  Nullable |
| `r9` | `int2` |  Nullable |
| `r10` | `int2` |  Nullable |
| `r11` | `int2` |  Nullable |
| `r12` | `int2` |  Nullable |
| `r13` | `int2` |  Nullable |
| `r14` | `int2` |  Nullable |
| `r15` | `int2` |  Nullable |
| `r16` | `int2` |  Nullable |
| `r17` | `int2` |  Nullable |
| `r18` | `int2` |  Nullable |
| `r19` | `int2` |  Nullable |
| `r20` | `int2` |  Nullable |
| `r21` | `int2` |  Nullable |
| `r22` | `int2` |  Nullable |
| `r23` | `int2` |  Nullable |
| `r24` | `int2` |  Nullable |
| `puntaje_total` | `int2` |  Nullable |
| `nivel_desempeno` | `varchar` |  Nullable |
| `comentarios` | `text` |  Nullable |
| `fecha_respuesta` | `timestamp` |  Nullable |

## Table `autoevaluacion_docente`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `fecha_respuesta` | `timestamp` |  Nullable |
| `ae_planificacion_clases` | `int2` |  Nullable |
| `ae_dominio_contenido` | `int2` |  Nullable |
| `ae_estrategias_didacticas` | `int2` |  Nullable |
| `ae_retroalimentacion` | `int2` |  Nullable |
| `ae_puntualidad_asistencia` | `int2` |  Nullable |
| `ae_uso_plataforma` | `int2` |  Nullable |
| `ae_trato_estudiantes` | `int2` |  Nullable |
| `ae_cumplimiento_programa` | `int2` |  Nullable |
| `ae_actualizacion_profesional` | `int2` |  Nullable |
| `ae_evaluacion_aprendizaje` | `int2` |  Nullable |
| `score_normalizado` | `numeric` |  Nullable |
| `categoria` | `varchar` |  Nullable |
| `reflexion_personal` | `text` |  Nullable |

## Table `calificacion_final_docente`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `score_encuesta_estudiantil` | `numeric` |  Nullable |
| `score_coordinacion` | `numeric` |  Nullable |
| `score_planeacion` | `numeric` |  Nullable |
| `score_observacion` | `numeric` |  Nullable |
| `score_autoevaluacion` | `numeric` |  Nullable |
| `categoria_final` | `varchar` |  Nullable |
| `tiene_comentarios_foco_rojo` | `bool` |  Nullable |
| `tiene_comentarios_criticos` | `bool` |  Nullable |
| `num_instrumentos_completados` | `int2` |  Nullable |
| `calculado_en` | `timestamp` |  Nullable |
| `calificacion_final` | `numeric` |  Nullable |

## Table `campus`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `nombre` | `varchar` |  Unique |
| `activo` | `bool` |  Nullable |

## Table `cuatrimestres`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `clave` | `varchar` |  Unique |
| `nombre` | `varchar` |  |
| `fecha_inicio` | `date` |  |
| `fecha_fin` | `date` |  |
| `activo` | `bool` |  Nullable |
| `cerrado` | `bool` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `docentes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `nombre` | `varchar` |  |
| `apellidos` | `varchar` |  |
| `email` | `varchar` |  Unique |
| `num_empleado` | `varchar` |  Nullable Unique |
| `licenciatura_id` | `int4` |  Nullable |
| `foto_url` | `varchar` |  Nullable |
| `activo` | `bool` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `apellido_paterno` | `varchar` |  Nullable |
| `apellido_materno` | `varchar` |  Nullable |
| `campus` | `varchar` |  Nullable |
| `turno` | `varchar` |  Nullable |
| `oferta_academica` | `text` |  Nullable |

## Table `encuesta_control_envio`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `estudiante_id` | `int4` |  Nullable |
| `grupo_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `fecha_envio` | `timestamp` |  Nullable |

## Table `encuesta_estudiantil`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `grupo_id` | `int4` |  Nullable |
| `asignatura_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `ciclo` | `varchar` |  Nullable |
| `total_respuestas` | `int4` |  Nullable |
| `prom_asistencia` | `numeric` |  Nullable |
| `prom_organizacion` | `numeric` |  Nullable |
| `prom_actitud` | `numeric` |  Nullable |
| `prom_ensenanza` | `numeric` |  Nullable |
| `prom_dominio` | `numeric` |  Nullable |
| `prom_evaluacion` | `numeric` |  Nullable |
| `prom_comunicacion` | `numeric` |  Nullable |
| `prom_gestion` | `numeric` |  Nullable |
| `prom_tecnologia` | `numeric` |  Nullable |
| `prom_satisfaccion` | `numeric` |  Nullable |
| `promedio_general` | `numeric` |  Nullable |
| `score_normalizado` | `numeric` |  Nullable |
| `comentarios` | `text` |  Nullable |
| `fecha_registro` | `date` |  Nullable |

## Table `encuesta_estudiantil_respuestas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `grupo_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `fecha_respuesta` | `timestamp` |  Nullable |
| `calidad_general` | `int2` |  |
| `item_plan_estudio` | `int2` |  Nullable |
| `item_trato_respeto` | `int2` |  Nullable |
| `item_asistencia` | `int2` |  Nullable |
| `item_puntualidad` | `int2` |  Nullable |
| `item_participacion` | `int2` |  Nullable |
| `item_dominio_materia` | `int2` |  Nullable |
| `item_plataforma_moodle` | `int2` |  Nullable |
| `item_pensamiento_critico` | `int2` |  Nullable |
| `item_desafio_intelectual` | `int2` |  Nullable |
| `item_claridad_objetivos` | `int2` |  Nullable |
| `item_lecturas_aprendizaje` | `int2` |  Nullable |
| `item_respeto_reglas` | `int2` |  Nullable |
| `item_interes_materia` | `int2` |  Nullable |
| `item_apoyos_didacticos` | `int2` |  Nullable |
| `item_actitudes_valores` | `int2` |  Nullable |
| `item_retroalimentacion` | `int2` |  Nullable |
| `item_criterios_evaluacion` | `int2` |  Nullable |
| `item_receptividad` | `int2` |  Nullable |
| `comentario_abierto` | `text` |  Nullable |
| `clasificacion_comentario` | `varchar` |  Nullable |
| `anonimo` | `bool` |  Nullable |

## Table `estudiantes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `nombre` | `varchar` |  |
| `apellidos` | `varchar` |  |
| `email` | `varchar` |  Unique |
| `matricula` | `varchar` |  Unique |
| `licenciatura_id` | `int4` |  Nullable |
| `cuatrimestre_actual` | `int4` |  Nullable |
| `activo` | `bool` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `evaluacion_coordinacion`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `evaluador_id` | `uuid` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `ciclo` | `varchar` |  |
| `campus` | `varchar` |  |
| `a1` | `int2` |  Nullable |
| `a2` | `int2` |  Nullable |
| `a3` | `int2` |  Nullable |
| `b1` | `int2` |  Nullable |
| `b2` | `int2` |  Nullable |
| `b3` | `int2` |  Nullable |
| `c1` | `int2` |  Nullable |
| `c2` | `int2` |  Nullable |
| `c3` | `int2` |  Nullable |
| `d1` | `int2` |  Nullable |
| `d2` | `int2` |  Nullable |
| `d3` | `int2` |  Nullable |
| `e1` | `int2` |  Nullable |
| `e2` | `int2` |  Nullable |
| `e3` | `int2` |  Nullable |
| `puntos_obtenidos` | `int2` |  Nullable |
| `score_normalizado` | `numeric` |  Nullable |
| `categoria` | `varchar` |  Nullable |
| `comentarios` | `text` |  Nullable |
| `fecha_evaluacion` | `timestamp` |  Nullable |
| `asignatura_id` | `int4` |  Nullable |

## Table `evaluacion_planeacion`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `evaluador_id` | `uuid` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `asignatura_id` | `int4` |  Nullable |
| `fecha_evaluacion` | `date` |  |
| `criterio_elementos_curriculares` | `int2` |  Nullable |
| `criterio_fase_inicio` | `int2` |  Nullable |
| `criterio_fase_desarrollo` | `int2` |  Nullable |
| `criterio_fase_cierre` | `int2` |  Nullable |
| `criterio_caracteristicas_act` | `int2` |  Nullable |
| `criterio_estrategias_didacticas` | `int2` |  Nullable |
| `criterio_recursos_didacticos` | `int2` |  Nullable |
| `criterio_organizacion_grupo` | `int2` |  Nullable |
| `criterio_estrategias_evaluacion` | `int2` |  Nullable |
| `criterio_productos` | `int2` |  Nullable |
| `criterio_bibliografia` | `int2` |  Nullable |
| `puntos_totales` | `int2` |  Nullable |
| `categoria` | `varchar` |  Nullable |
| `comentarios` | `text` |  Nullable |
| `score_normalizado` | `numeric` |  Nullable |

## Table `grupos`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `clave` | `varchar` |  |
| `asignatura_id` | `int4` |  Nullable |
| `docente_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `num_alumnos` | `int4` |  Nullable |
| `activo` | `bool` |  Nullable |
| `modalidad` | `varchar` |  Nullable |
| `turno_grupo` | `varchar` |  Nullable |

## Table `inscripciones`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `estudiante_id` | `int4` |  Nullable |
| `grupo_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `fecha` | `date` |  Nullable |

## Table `instrumento_preguntas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `instrumento` | `varchar` |  |
| `seccion` | `varchar` |  Nullable |
| `orden` | `int2` |  |
| `texto` | `text` |  |
| `escala_min` | `int2` |  Nullable |
| `escala_max` | `int2` |  Nullable |
| `activa` | `bool` |  Nullable |
| `tipo_respuesta` | `varchar` |  Nullable |
| `opciones` | `jsonb` |  Nullable |

## Table `licenciaturas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `clave` | `varchar` |  Unique |
| `nombre` | `varchar` |  |
| `facultad` | `varchar` |  Nullable |
| `activa` | `bool` |  Nullable |

## Table `observacion_clase`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `observador_id` | `uuid` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `grupo_id` | `int4` |  Nullable |
| `fecha_observacion` | `date` |  |
| `hora_inicio` | `time` |  Nullable |
| `hora_fin` | `time` |  Nullable |
| `puntuacion_total` | `numeric` |  |
| `dim_inicio_clase` | `numeric` |  Nullable |
| `dim_desarrollo` | `numeric` |  Nullable |
| `dim_cierre` | `numeric` |  Nullable |
| `dim_clima_aula` | `numeric` |  Nullable |
| `dim_uso_recursos` | `numeric` |  Nullable |
| `categoria` | `varchar` |  |
| `observaciones` | `text` |  Nullable |
| `recomendaciones` | `text` |  Nullable |
| `score_normalizado` | `numeric` |  Nullable |

## Table `observaciones`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `evaluador_id` | `uuid` |  Nullable |
| `oferta_academica` | `varchar` |  |
| `cuatrimestre_grupo` | `varchar` |  |
| `ciclo` | `varchar` |  |
| `campus` | `varchar` |  |
| `cco1` | `int2` |  Nullable |
| `cco2` | `int2` |  Nullable |
| `cco3` | `int2` |  Nullable |
| `cco4` | `int2` |  Nullable |
| `cco5` | `int2` |  Nullable |
| `cco6` | `int2` |  Nullable |
| `cco7` | `int2` |  Nullable |
| `obs_cognitivas` | `text` |  Nullable |
| `cme1` | `int2` |  Nullable |
| `cme2` | `int2` |  Nullable |
| `cme3` | `int2` |  Nullable |
| `cme4` | `int2` |  Nullable |
| `cme5` | `int2` |  Nullable |
| `cme6` | `int2` |  Nullable |
| `cme7` | `int2` |  Nullable |
| `cme8` | `int2` |  Nullable |
| `cme9` | `int2` |  Nullable |
| `obs_metacognitivas` | `text` |  Nullable |
| `ccom1` | `int2` |  Nullable |
| `ccom2` | `int2` |  Nullable |
| `ccom3` | `int2` |  Nullable |
| `ccom4` | `int2` |  Nullable |
| `obs_comunicativas` | `text` |  Nullable |
| `cso1` | `int2` |  Nullable |
| `cso2` | `int2` |  Nullable |
| `cso3` | `int2` |  Nullable |
| `cso4` | `int2` |  Nullable |
| `obs_sociales` | `text` |  Nullable |
| `cge1` | `int2` |  Nullable |
| `cge2` | `int2` |  Nullable |
| `cge3` | `int2` |  Nullable |
| `cge4` | `int2` |  Nullable |
| `cge5` | `int2` |  Nullable |
| `cge6` | `int2` |  Nullable |
| `cge7` | `int2` |  Nullable |
| `obs_gestion` | `text` |  Nullable |
| `caf1` | `int2` |  Nullable |
| `caf2` | `int2` |  Nullable |
| `obs_afectivas` | `text` |  Nullable |
| `ctepe1` | `int2` |  Nullable |
| `ctepe2` | `int2` |  Nullable |
| `ctepe3` | `int2` |  Nullable |
| `ctepe4` | `int2` |  Nullable |
| `ctepe5` | `int2` |  Nullable |
| `ctepe6` | `int2` |  Nullable |
| `ctepe7` | `int2` |  Nullable |
| `obs_tecno` | `text` |  Nullable |
| `cno1` | `int2` |  Nullable |
| `cno2` | `int2` |  Nullable |
| `cno3` | `int2` |  Nullable |
| `cno4` | `int2` |  Nullable |
| `cno5` | `int2` |  Nullable |
| `obs_normativa` | `text` |  Nullable |
| `comentario_docente` | `text` |  Nullable |
| `comentario_evaluador` | `text` |  Nullable |
| `fecha_observacion` | `timestamp` |  Nullable |
| `asignatura_id` | `int4` |  Nullable |
| `grupo_id_fk` | `int4` |  Nullable |

## Table `ofertas_academicas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `nombre` | `varchar` |  Unique |
| `activa` | `bool` |  Nullable |

## Table `planeaciones`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `docente_id` | `int4` |  Nullable |
| `cuatrimestre_id` | `int4` |  Nullable |
| `asignatura_id` | `int4` |  Nullable |
| `campus` | `text` |  Nullable |
| `turno` | `text` |  Nullable |
| `modalidad` | `text` |  Nullable |
| `grupo` | `text` |  |
| `proyecto` | `bool` |  Nullable |
| `laboratorio` | `varchar` |  Nullable |
| `visitas` | `varchar` |  Nullable |
| `url_pdf` | `text` |  |
| `nombre_archivo` | `text` |  Nullable |
| `comentario_docente` | `text` |  Nullable |
| `criterio_alineacion` | `int2` |  Nullable |
| `criterio_secuencia` | `int2` |  Nullable |
| `criterio_recursos` | `int2` |  Nullable |
| `criterio_evaluacion` | `int2` |  Nullable |
| `puntaje_promedio` | `numeric` |  Nullable |
| `estado` | `varchar` |  Nullable |
| `comentario_retroalimentacion` | `text` |  Nullable |
| `comentario_interno` | `text` |  Nullable |
| `fecha_subida` | `timestamp` |  Nullable |
| `fecha_evaluacion` | `timestamp` |  Nullable |

## Table `turnos`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int4` | Primary |
| `nombre` | `varchar` |  Unique |
| `activo` | `bool` |  Nullable |

## Table `usuarios`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  Unique |
| `rol` | `varchar` |  |
| `entidad_id` | `int4` |  Nullable |
| `activo` | `bool` |  Nullable |
| `ultimo_acceso` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

