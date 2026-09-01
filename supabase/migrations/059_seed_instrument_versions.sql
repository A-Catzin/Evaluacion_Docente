-- Approved definitions. This migration deliberately seeds a new immutable
-- version rather than changing any legacy rubric, response, or score.

INSERT INTO public.instrument_definitions(code, purpose, title) VALUES
  ('coordination', 'coordination', 'Evaluación de Coordinación al Docente'),
  ('planning', 'planning', 'Lista de cotejo de Planeación Didáctica'),
  ('observation_escolarizado', 'observation', 'Observación de clase escolarizada'),
  ('observation_virtual', 'observation', 'Observación de clase virtual'),
  ('observation_ejecutivo', 'observation', 'Observación de clase ejecutiva')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.instrument_versions(definition_id, version, effective_from, scale_metadata, scoring_metadata)
SELECT d.id, x.version, '2026-09-01T00:00:00Z'::timestamptz, x.scale, x.scoring
FROM public.instrument_definitions d
JOIN (VALUES
  ('coordination', 'v2', '{"min":1,"max":5,"labels":{"1":"No logrado","2":"En proceso","3":"Adecuado","4":"Eficaz","5":"Ejemplar","na":"No aplica"}}'::jsonb, '{"method":"mean_to_100","na_threshold_percent":20,"administrative_checks_scored":false}'::jsonb),
  ('planning', 'v2', '{"min":0,"max":2,"labels":{"0":"No","1":"Parcial","2":"Sí","na":"No aplica"}}'::jsonb, '{"method":"equal_weight_to_100","na_threshold_percent":20,"expected_scored_items":61}'::jsonb),
  ('observation_escolarizado', 'v1.2', '{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb, '{"method":"mean_to_100","raw_scale":"1-3","na_threshold_percent":20}'::jsonb),
  ('observation_virtual', 'v1.2', '{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb, '{"method":"mean_to_100","raw_scale":"1-3","na_threshold_percent":20}'::jsonb),
  ('observation_ejecutivo', 'v1.2', '{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb, '{"method":"mean_to_100","raw_scale":"1-3","na_threshold_percent":20}'::jsonb)
) AS x(code, version, scale, scoring) ON d.code = x.code
ON CONFLICT (definition_id, version) DO NOTHING;

INSERT INTO public.instrument_sections(version_id, code, title, position, scored)
SELECT v.id, x.code, x.title, x.position, true
FROM (VALUES
  ('coordination','v2','I','Planeación y Gestión Académica',1), ('coordination','v2','II','Gestión Administrativa y Operativa',2), ('coordination','v2','III','Desempeño Profesional, Comunicación y Colaboración',3), ('coordination','v2','IV','Compromiso Institucional y Ética',4),
  ('planning','v2','I','Datos generales',1), ('planning','v2','II','Fin de aprendizaje o formación',2), ('planning','v2','III','Integración de criterios de evaluación formativa',3), ('planning','v2','IV','Planeación operativa por unidad',4), ('planning','v2','V','Actividades bajo conducción docente',5), ('planning','v2','VI','Estrategias de enseñanza',6), ('planning','v2','VII','Actividades de manera independiente',7), ('planning','v2','VIII','Evidencias o productos de aprendizaje',8), ('planning','v2','IX','Congruencia entre los elementos de la planeación',9), ('planning','v2','X','Viabilidad y calidad de la planeación',10), ('planning','v2','XI','Elementos finales',11),
  ('observation_escolarizado','v1.2','COG','Dimensión Cognitiva',1), ('observation_escolarizado','v1.2','MET','Dimensión Metacognitiva',2), ('observation_escolarizado','v1.2','COM','Dimensión Comunicativa',3), ('observation_escolarizado','v1.2','SOC','Dimensión Social',4), ('observation_escolarizado','v1.2','GES','Gestión de la Enseñanza',5), ('observation_escolarizado','v1.2','AFE','Dimensión Afectiva',6), ('observation_escolarizado','v1.2','TEC','Dimensión Tecno-Pedagógica',7), ('observation_escolarizado','v1.2','NOR','Dimensión Normativa',8),
  ('observation_virtual','v1.2','COG','Dimensión Cognitiva',1), ('observation_virtual','v1.2','MET','Dimensión Metacognitiva y Autonomía',2), ('observation_virtual','v1.2','COM','Dimensión Comunicativa',3), ('observation_virtual','v1.2','SOC','Dimensión Social',4), ('observation_virtual','v1.2','GES','Gestión de la Enseñanza',5), ('observation_virtual','v1.2','AFE','Dimensión Afectiva',6), ('observation_virtual','v1.2','TEC','Dimensión Tecno-Pedagógica',7), ('observation_virtual','v1.2','NOR','Dimensión Normativa',8),
  ('observation_ejecutivo','v1.2','COG','Dimensión Cognitiva',1), ('observation_ejecutivo','v1.2','MET','Dimensión Metacognitiva y Autonomía',2), ('observation_ejecutivo','v1.2','COM','Dimensión Comunicativa',3), ('observation_ejecutivo','v1.2','SOC','Dimensión Social',4), ('observation_ejecutivo','v1.2','GES','Gestión de la Enseñanza',5), ('observation_ejecutivo','v1.2','AFE','Dimensión Afectiva',6), ('observation_ejecutivo','v1.2','TEC','Dimensión Tecno-Pedagógica',7), ('observation_ejecutivo','v1.2','NOR','Dimensión Normativa',8)
) AS x(definition_code, version, code, title, position)
JOIN public.instrument_definitions d ON d.code = x.definition_code
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = x.version
ON CONFLICT (version_id, code) DO NOTHING;

INSERT INTO public.instrument_items(version_id, section_id, code, label, position, na_eligible, na_policy)
SELECT v.id, s.id, x.code, x.label, x.position, x.na_eligible, x.na_policy
FROM (VALUES
  ('coordination','v2','I','C1','Cumplimiento del programa y avance académico.',1,true,'{"when":"new_program_or_executive_or_postgraduate_or_specialty"}'::jsonb),
  ('coordination','v2','I','C2','Organización y conducción de sesiones.',2,false,'{}'::jsonb),
  ('coordination','v2','I','C3','Uso de materiales didácticos y herramientas digitales.',3,false,'{}'::jsonb),
  ('coordination','v2','II','C4','Captura de calificaciones en tiempo y forma.',1,true,'{"when":"escolarizado_or_modalidad_2"}'::jsonb),
  ('coordination','v2','II','C5','Puntualidad y asistencia.',2,false,'{}'::jsonb),
  ('coordination','v2','III','C6','Comunicación clara, oportuna y profesional.',1,false,'{}'::jsonb),
  ('coordination','v2','III','C7','Participación activa y colaborativa institucional.',2,false,'{}'::jsonb),
  ('coordination','v2','III','C8','Aplicación de mejoras en la práctica docente.',3,true,'{"when":"new_hire"}'::jsonb),
  ('coordination','v2','III','C9','Acompañamiento y adaptación institucional.',4,true,'{"when":"returning_teacher"}'::jsonb),
  ('coordination','v2','IV','C10','Cumplimiento normativo y administrativo.',1,false,'{}'::jsonb),
  ('coordination','v2','IV','C11','Trato respetuoso, ético y profesional.',2,false,'{}'::jsonb),
  ('coordination','v2','IV','C12','Identidad y representación institucional.',3,false,'{}'::jsonb),
  ('planning','v2','I','P1','Se registra el nombre completo del docente.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','I','P2','Se identifica correctamente el programa educativo o área.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','I','P3','Se registra correctamente la asignatura, módulo o espacio formativo.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','I','P4','Se selecciona correctamente la modalidad o función docente.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','I','P5','Se registra el periodo, cuatrimestre y ciclo académico correspondiente.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','II','P6','Se encuentra claramente establecido el fin de aprendizaje o formación.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','II','P7','El fin de aprendizaje es congruente con la asignatura o espacio formativo.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','II','P8','El fin de aprendizaje guarda relación con los contenidos y unidades de la asignatura.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P9','Se integran los criterios de evaluación correspondientes a cada parcial.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P10','Las actividades bajo conducción docente están consideradas dentro de la evaluación cuando corresponde.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P11','Las actividades independientes están consideradas dentro de la evaluación cuando corresponde.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P12','Se contempla la evaluación integradora del aprendizaje.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P13','Las ponderaciones registradas son congruentes con la estructura institucional.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','III','P14','Existe correspondencia entre los criterios de evaluación y las evidencias o productos previstos en la planeación.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P15','Las unidades están organizadas de acuerdo con la estructura de la asignatura.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P16','Cada unidad cuenta con un objetivo claramente establecido.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P17','El objetivo de la unidad es congruente con el fin de aprendizaje o formación.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P18','Los subtemas corresponden a los contenidos de la unidad.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P19','Los subtemas están distribuidos de manera viable entre las semanas disponibles.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IV','P20','Existe una secuencia lógica entre los subtemas.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P21','Se describen las actividades que realizará el docente durante la sesión.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P22','Las actividades están organizadas en inicio, desarrollo y cierre.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P23','El inicio permite introducir o dar sentido al tema de la sesión.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P24','El desarrollo contempla las acciones necesarias para abordar el contenido.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P25','El cierre permite consolidar lo trabajado durante la sesión.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P26','Las actividades del docente son congruentes con el objetivo de aprendizaje.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P27','Se especifica claramente qué hará el docente y no solamente qué tema explicará.',7,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','V','P28','Las actividades contemplan la participación del estudiante cuando corresponde.',8,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VI','P29','Se identifica la estrategia de enseñanza utilizada.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VI','P30','La estrategia seleccionada es pertinente para el contenido.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VI','P31','La estrategia es congruente con el objetivo de la sesión o unidad.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VI','P32','Se identifican los recursos o medios necesarios para implementar la estrategia.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VI','P33','La estrategia permite al docente acompañar y orientar el aprendizaje.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P34','Se especifican las actividades que realizará el estudiante de manera independiente.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P35','Las actividades independientes tienen relación directa con los aprendizajes de la unidad.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P36','Las instrucciones de las actividades son claras y suficientes.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P37','La actividad requiere una participación activa del estudiante.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P38','Se identifica la estrategia de aprendizaje involucrada.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VII','P39','La carga de trabajo es viable para el estudiante.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VIII','P40','Se identifica la evidencia o producto de aprendizaje.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VIII','P41','La evidencia corresponde a las actividades planteadas.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VIII','P42','La evidencia permite demostrar el aprendizaje esperado.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VIII','P43','La evidencia es observable o verificable.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','VIII','P44','La evidencia es congruente con el nivel de complejidad del aprendizaje.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P45','Existe relación entre el objetivo de la unidad y los subtemas.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P46','Existe relación entre los subtemas y las actividades.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P47','Existe relación entre las actividades y las estrategias de enseñanza/aprendizaje.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P48','Existe relación entre las actividades y las evidencias o productos.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P49','Existe relación entre las evidencias y los criterios de evaluación.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','IX','P50','La secuencia completa permite alcanzar progresivamente los aprendizajes previstos.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P51','La cantidad de contenidos es viable para el tiempo disponible.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P52','Las actividades pueden realizarse dentro del tiempo asignado.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P53','Los recursos necesarios están disponibles o son accesibles.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P54','Las actividades son pertinentes para la modalidad de la asignatura.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P55','La redacción de la planeación es clara y específica.',5,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P56','Las actividades están redactadas de manera que otro docente pueda comprender qué se realizará.',6,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','X','P57','Existe correspondencia entre lo planeado y lo que razonablemente puede desarrollarse en el aula.',7,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','XI','P58','Se incluyen comentarios y/o sugerencias cuando son necesarios.',1,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','XI','P59','La bibliografía básica corresponde a los contenidos de la asignatura.',2,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','XI','P60','La bibliografía complementaria contribuye al desarrollo o profundización de los aprendizajes.',3,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb),
  ('planning','v2','XI','P61','La bibliografía está presentada de manera clara y consistente.',4,true,'{"when":"not_applicable_to_subject_or_context"}'::jsonb)
) AS x(definition_code, version, section_code, code, label, position, na_eligible, na_policy)
JOIN public.instrument_definitions d ON d.code = x.definition_code
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = x.version
JOIN public.instrument_sections s ON s.version_id = v.id AND s.code = x.section_code
ON CONFLICT (version_id, code) DO NOTHING;

-- The observation items are intentionally stored as code plus exact modality
-- wording in the database snapshot. Every V1.2 criterion has conditional N/A.
INSERT INTO public.instrument_items(version_id, section_id, code, label, position, na_eligible, na_policy)
SELECT v.id, s.id, x.code, x.label, x.position, true, '{"when":"not_applicable_or_not_observable"}'::jsonb
FROM (VALUES
  ('observation_escolarizado','COG','COG1','Expone y desarrolla los contenidos de manera clara, organizada y comprensible.',1),('observation_escolarizado','COG','COG2','Evidencia dominio de los contenidos abordados durante la sesión.',2),('observation_escolarizado','COG','COG3','Relaciona los contenidos con ejemplos, situaciones reales o contextos propios del campo profesional.',3),
  ('observation_escolarizado','MET','MET1','Promueve actividades diversas para que los estudiantes expliquen, analicen o reflexionen sobre lo aprendido.',1),('observation_escolarizado','MET','MET2','Promueve la formulación de preguntas o actividades que favorecen el razonamiento y la reflexión.',2),('observation_escolarizado','MET','MET3','Utiliza errores o dificultades como oportunidades para retroalimentar y fortalecer el aprendizaje.',3),('observation_escolarizado','MET','MET4','Propicia que los estudiantes transfieran lo aprendido a nuevas situaciones o problemas.',4),('observation_escolarizado','MET','MET5','Realiza un resumen integrador al finalizar cada bloque temático.',5),
  ('observation_escolarizado','COM','COM1','Se comunica de manera clara, respetuosa y apropiada al nivel y características de los estudiantes.',1),('observation_escolarizado','COM','COM2','Utiliza adecuadamente recursos verbales y no verbales para favorecer la comunicación.',2),('observation_escolarizado','COM','COM3','Comunica con claridad los propósitos, instrucciones, actividades y resultados esperados.',3),('observation_escolarizado','COM','COM4','Genera oportunidades para que los estudiantes expresen, expliquen, argumenten o comuniquen ideas.',4),
  ('observation_escolarizado','SOC','SOC1','Mantiene un ambiente de respeto, inclusión y trato equitativo.',1),('observation_escolarizado','SOC','SOC2','Genera oportunidades de participación para diferentes estudiantes.',2),('observation_escolarizado','SOC','SOC3','Fomenta un clima de respeto, empatía y confianza cuando la actividad lo permite.',3),
  ('observation_escolarizado','GES','GES1','Organiza objetivos y contenidos de manera coherente con el modelo educativo y las necesidades del grupo.',1),('observation_escolarizado','GES','GES2','Implementa estrategias didácticas pertinentes al contenido y características del grupo.',2),('observation_escolarizado','GES','GES3','Integra conocimientos, intereses, experiencias o saberes previos relevantes.',3),('observation_escolarizado','GES','GES4','Promueve preguntas, problemas, casos o actividades que favorecen el análisis y pensamiento crítico.',4),('observation_escolarizado','GES','GES5','Motiva a los estudiantes hacia el aprendizaje, la indagación y la búsqueda autónoma.',5),('observation_escolarizado','GES','GES6','Utiliza recursos tecnológicos, didácticos y materiales complementarios pertinentes.',6),('observation_escolarizado','GES','GES7','Brinda retroalimentación oportuna, clara, respetuosa, específica y orientada a mejorar el aprendizaje.',7),
  ('observation_escolarizado','AFE','AFE1','Genera un ambiente donde los estudiantes pueden participar, preguntar o equivocarse sin temor.',1),('observation_escolarizado','AFE','AFE2','Identifica y reconoce de manera respetuosa fortalezas, esfuerzos, avances o logros.',2),('observation_escolarizado','AFE','AFE3','Muestra disposición, apertura y respeto ante preguntas, dudas o dificultades.',3),
  ('observation_escolarizado','TEC','TEC1','Diseña proyectos y actividades integradoras con recursos didácticos o tecnológicos pertinentes.',1),('observation_escolarizado','TEC','TEC2','Promueve el uso autónomo de la tecnología y la participación activa.',2),('observation_escolarizado','TEC','TEC3','Demuestra dominio de herramientas tecnológicas con propósito pedagógico.',3),('observation_escolarizado','TEC','TEC4','Selecciona y aplica métodos y técnicas didácticas pertinentes a su campo.',4),('observation_escolarizado','TEC','TEC5','Fomenta el uso responsable, ético y seguro de herramientas y recursos digitales.',5),
  ('observation_escolarizado','NOR','NOR1','Inicia la sesión dentro del horario establecido.',1),('observation_escolarizado','NOR','NOR2','Desarrolla contenidos y actividades congruentes con su planeación.',2),('observation_escolarizado','NOR','NOR3','Concluye la sesión respetando el horario institucional.',3),
  ('observation_virtual','COG','COG1','Expone y organiza contenidos con claridad, secuencia y precisión en el entorno virtual.',1),('observation_virtual','COG','COG2','Relaciona contenidos con ejemplos, casos, problemas o situaciones contextualizadas.',2),('observation_virtual','COG','COG3','Adapta explicaciones y estrategias ante condiciones tecnológicas o de interacción.',3),('observation_virtual','COG','COG4','Utiliza apoyos visuales, multimedia o recursos digitales cuando aportan valor.',4),('observation_virtual','COG','COG5','Clarifica conceptos mediante apoyos visuales y herramientas interactivas.',5),('observation_virtual','COG','COG6','Propone preguntas o actividades que favorecen análisis, razonamiento y aplicación.',6),
  ('observation_virtual','MET','MET1','Genera espacios para que los estudiantes reflexionen sobre aprendizajes, avances o dificultades.',1),('observation_virtual','MET','MET2','Orienta para identificar fortalezas, áreas de oportunidad y acciones de mejora.',2),('observation_virtual','MET','MET3','Proporciona recursos u orientación para la continuidad del aprendizaje autónomo.',3),('observation_virtual','MET','MET4','Incorpora recapitulación, síntesis, autoevaluación o reflexión sobre el propio aprendizaje.',4),
  ('observation_virtual','COM','COM1','Se comunica clara y asertivamente mediante voz, dicción, ritmo, volumen y lenguaje apropiados.',1),('observation_virtual','COM','COM2','Gestiona respetuosa y ordenadamente voz, chat, reacciones y demás canales.',2),('observation_virtual','COM','COM3','Explica con precisión propósitos, instrucciones, procedimientos y productos esperados.',3),('observation_virtual','COM','COM4','Utiliza lenguaje accesible y adapta explicaciones ante dificultades de comprensión.',4),('observation_virtual','COM','COM5','Verifica la comprensión mediante preguntas, chat, reacciones, encuestas u otras estrategias.',5),
  ('observation_virtual','SOC','SOC1','Promueve respeto, convivencia e inclusión y atiende intervenciones con pertinencia.',1),('observation_virtual','SOC','SOC2','Genera participación equitativa sin depender exclusivamente de cámara o micrófono.',2),('observation_virtual','SOC','SOC3','Gestiona imprevistos tecnológicos manteniendo continuidad pedagógica e inclusión.',3),
  ('observation_virtual','GES','GES1','Organiza la sesión con inicio, desarrollo y cierre alineados con Moodle.',1),('observation_virtual','GES','GES2','Implementa estrategias activas adecuadas al entorno virtual y propósito de la sesión.',2),('observation_virtual','GES','GES3','Distribuye el tiempo equilibrando explicación, participación, práctica y retroalimentación.',3),('observation_virtual','GES','GES4','Integra recursos digitales o multimedia pertinentes, funcionales y accesibles.',4),('observation_virtual','GES','GES5','Proporciona retroalimentación clara, específica, respetuosa y oportuna.',5),
  ('observation_virtual','AFE','AFE1','Genera confianza y seguridad que favorecen participación, ideas, dudas e inquietudes.',1),('observation_virtual','AFE','AFE2','Reconoce avances o aportaciones de manera respetuosa.',2),('observation_virtual','AFE','AFE3','Responde con flexibilidad y empatía ante baja participación o dificultades tecnológicas.',3),('observation_virtual','AFE','AFE4','Mantiene presencia docente cercana y disponible durante la sesión.',4),
  ('observation_virtual','TEC','TEC1','Maneja funcionalmente Moodle, Meet y las herramientas necesarias para la sesión.',1),('observation_virtual','TEC','TEC2','Utiliza herramientas digitales en función del propósito pedagógico.',2),('observation_virtual','TEC','TEC3','Gestiona participantes, chat, micrófonos, pantalla u otras funciones del aula virtual.',3),('observation_virtual','TEC','TEC5','Fomenta el uso responsable, ético y seguro de herramientas y recursos digitales.',4),
  ('observation_virtual','NOR','NOR1','Inicia la sesión dentro del horario establecido.',1),('observation_virtual','NOR','NOR2','Desarrolla contenidos y actividades congruentes con su planeación.',2),('observation_virtual','NOR','NOR3','Concluye la sesión respetando el horario institucional.',3),
  ('observation_ejecutivo','COG','COG1','Explica contenidos esenciales con claridad, síntesis y precisión.',1),('observation_ejecutivo','COG','COG2','Recupera y vincula aprendizajes previos con los contenidos abordados.',2),('observation_ejecutivo','COG','COG3','Integra contenidos y actividades de Moodle con el trabajo presencial.',3),('observation_ejecutivo','COG','COG4','Aclara conceptos esenciales y orienta el trabajo autónomo.',4),
  ('observation_ejecutivo','MET','MET1','Genera reflexión sobre avances, dificultades o aprendizajes del trabajo autónomo.',1),('observation_ejecutivo','MET','MET2','Orienta estrategias concretas para organizar, desarrollar o mejorar trabajo independiente.',2),('observation_ejecutivo','MET','MET3','Utiliza errores o dificultades como oportunidades de retroalimentación y mejora.',3),('observation_ejecutivo','MET','MET4','Promueve autoevaluación para identificar progreso y refuerzos necesarios.',4),
  ('observation_ejecutivo','COM','COM1','Se comunica con claridad, coherencia, orden, respeto y secuencia lógica.',1),('observation_ejecutivo','COM','COM2','Explica instrucciones, criterios y productos esperados de actividades Moodle.',2),('observation_ejecutivo','COM','COM3','Genera confianza y apertura para dudas, comentarios o aclaraciones.',3),('observation_ejecutivo','COM','COM4','Verifica comprensión antes de avanzar o cerrar un bloque.',4),
  ('observation_ejecutivo','SOC','SOC1','Considera condiciones del estudiante ejecutivo y adapta su práctica.',1),('observation_ejecutivo','SOC','SOC2','Implementa estrategias breves e inclusivas que favorecen la participación.',2),
  ('observation_ejecutivo','GES','GES1','Gestiona el tiempo en bloques con propósito, ritmo adecuado y prioridades de aprendizaje.',1),('observation_ejecutivo','GES','GES2','Mantiene congruencia entre sesión, programa y actividades Moodle.',2),('observation_ejecutivo','GES','GES3','Implementa actividades de aplicación, reforzamiento o integración.',3),('observation_ejecutivo','GES','GES4','Brinda retroalimentación clara, específica, oportuna y orientada a mejorar.',4),
  ('observation_ejecutivo','AFE','AFE1','Genera respeto, empatía y confianza para participación y expresión.',1),('observation_ejecutivo','AFE','AFE2','Reconoce avances, esfuerzos o logros presenciales y autónomos.',2),('observation_ejecutivo','AFE','AFE3','Motiva a continuar el aprendizaje independiente con orientación realista.',3),
  ('observation_ejecutivo','TEC','TEC1','Orienta localización, propósito, instrucciones o seguimiento de Moodle.',1),('observation_ejecutivo','TEC','TEC2','Utiliza recursos digitales que aportan valor a comprensión, práctica o reforzamiento.',2),('observation_ejecutivo','TEC','TEC3','Brinda retroalimentación clara y oportuna en evidencias autónomas mediante Moodle.',3),
  ('observation_ejecutivo','NOR','NOR1','Inicia la sesión dentro del horario establecido.',1),('observation_ejecutivo','NOR','NOR2','Desarrolla contenidos y actividades congruentes con el programa ejecutivo.',2),('observation_ejecutivo','NOR','NOR3','Concluye la sesión respetando el horario institucional.',3)
) AS x(definition_code, section_code, code, label, position)
JOIN public.instrument_definitions d ON d.code = x.definition_code
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = 'v1.2'
JOIN public.instrument_sections s ON s.version_id = v.id AND s.code = x.section_code
ON CONFLICT (version_id, code) DO NOTHING;

INSERT INTO public.instrument_administrative_checks(version_id, section_code, code, label, position, na_eligible, applicability_policy)
SELECT v.id, x.section_code, x.code, x.label, x.position, true, x.policy
FROM (VALUES
 ('NEW_HIRE','AC1','Observación de clase muestra aprobada.',1,'{"when":"new_hire"}'::jsonb),('NEW_HIRE','AC2','Inducción docente METURS completada.',2,'{"when":"new_hire"}'::jsonb),
 ('RETURNING','AC3','Formación docente institucional concluida.',3,'{"when":"returning_teacher"}'::jsonb),('RETURNING','AC4','Entrega de actualización docente anual.',4,'{"when":"returning_teacher"}'::jsonb),
 ('DOCUMENTATION','AC5','Documentación personal y académica completa y actualizada.',5,'{}'::jsonb),('DOCUMENTATION','AC6','Entrega de disponibilidad de horario en tiempo y forma.',6,'{}'::jsonb),('DOCUMENTATION','AC7','Firma de contrato en tiempo y forma.',7,'{}'::jsonb),
 ('OPERATIONS','AC8','Entrega de planeación didáctica en tiempo y forma.',8,'{}'::jsonb),('OPERATIONS','AC9','Realización de prácticas académicas durante el cuatrimestre.',9,'{}'::jsonb),('OPERATIONS','AC10','Presentación e imagen profesional adecuada.',10,'{}'::jsonb),('OPERATIONS','AC11','Registro sin incidencias institucionales graves.',11,'{}'::jsonb),('OPERATIONS','AC12','Firma de la bitácora docente.',12,'{}'::jsonb),
 ('CLOSURE','AC13','Asistencia obligatoria a reuniones institucionales.',13,'{}'::jsonb),('CLOSURE','AC14','Captura de calificaciones parciales y finales en sistema.',14,'{}'::jsonb),('CLOSURE','AC15','Entrega de actas de módulo y actas finales.',15,'{}'::jsonb),('CLOSURE','AC16','Entrega de exámenes extraordinarios diseñados en tiempo.',16,'{}'::jsonb),('CLOSURE','AC17','Seguimiento de acuerdos administrativos del ciclo.',17,'{}'::jsonb)
) AS x(section_code, code, label, position, policy)
JOIN public.instrument_definitions d ON d.code = 'coordination'
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = 'v2'
ON CONFLICT (version_id, code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
