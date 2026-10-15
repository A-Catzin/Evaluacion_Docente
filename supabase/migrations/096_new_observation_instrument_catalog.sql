-- Digital observer-adapted v1.1; source V1.1 SHA-256 (private catalog):
-- CC: 5311fcc8d6559b1871394af42832c2e2e43bd4b8b8514c72e5b0fa848ad66d1c
-- PP: 6a56fa46637ccfd7f066491c61be50bf68afe71a5259a2632a5690ed4c14faa6
-- SIM: 844a242659107ecf1848726288a65378073fa63a2e66e9b211339cccb88fc860
-- AUTO: 675ffad6f76fd24c5bd0cb1b9e03dfb9c466cd0cc24a376312c6f851532eea44
-- Draft only. Activation and capture/revision rules are separate future cuts.
ALTER TABLE public.instrument_definitions DROP CONSTRAINT instrument_definitions_code_check;
ALTER TABLE public.instrument_definitions ADD CONSTRAINT instrument_definitions_code_check
  CHECK (code IN ('coordination', 'planning', 'observation_escolarizado', 'observation_virtual', 'observation_ejecutivo',
    'observation_supervision_clinical', 'observation_professional_practice', 'observation_simulation', 'observation_teaching_competencies'));

CREATE OR REPLACE FUNCTION public.get_active_instrument_definition(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_version_id UUID;
BEGIN
  IF p_code NOT IN ('coordination', 'planning', 'observation_escolarizado', 'observation_virtual', 'observation_ejecutivo',
    'observation_supervision_clinical', 'observation_professional_practice', 'observation_simulation', 'observation_teaching_competencies') THEN
    RAISE EXCEPTION 'valid instrument code required' USING ERRCODE = '22023';
  END IF;
  SELECT v.id INTO v_version_id
  FROM public.instrument_versions v JOIN public.instrument_definitions d ON d.id = v.definition_id
  WHERE d.code = p_code AND v.status = 'active' AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now())
  ORDER BY v.effective_from DESC LIMIT 1;
  IF v_version_id IS NULL THEN RAISE EXCEPTION 'active instrument version unavailable' USING ERRCODE = 'P0002'; END IF;
  RETURN public.instrument_definition_snapshot(v_version_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_active_instrument_definition(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_instrument_definition(TEXT) TO authenticated;

INSERT INTO public.instrument_definitions(code, purpose, title) VALUES
  ('observation_supervision_clinical','observation','Campos clínicos'),
  ('observation_professional_practice','observation','Práctica Profesional'),
  ('observation_simulation','observation','Simulación clínica'),
  ('observation_teaching_competencies','observation','Cultura y Deporte');

INSERT INTO public.instrument_versions(definition_id, version, status, effective_from, scale_metadata, scoring_metadata)
SELECT d.id, 'v1.1', 'draft', CURRENT_TIMESTAMP,
  '{"min":1,"max":3,"labels":{"1":"Requiere mejora","2":"Adecuado","3":"Destacado","na":"No aplica / No observable"}}'::jsonb,
  '{"method":"mean_to_100","raw_scale":"1-3","na_threshold_percent":20}'::jsonb
FROM public.instrument_definitions d
WHERE d.code IN ('observation_supervision_clinical', 'observation_professional_practice', 'observation_simulation', 'observation_teaching_competencies');

INSERT INTO public.instrument_sections(version_id, code, title, position)
SELECT v.id, x.section_code, x.title, x.position
FROM (VALUES
  ('CC','01','Cognitivas',1),
  ('CC','02','Metacognitivas',2),
  ('CC','03','Comunicativas',3),
  ('CC','04','Sociales',4),
  ('CC','05','Gestión de la Enseñanza',5),
  ('CC','06','Afectivas',6),
  ('CC','07','Tecno-Pedagógicas',7),
  ('CC','08','Normatividad',8),
  ('PP','01','Cognitivas',1),
  ('PP','02','Metacognitivas',2),
  ('PP','03','Comunicativas',3),
  ('PP','04','Sociales',4),
  ('PP','05','Gestión de la Enseñanza',5),
  ('PP','06','Afectivas',6),
  ('PP','07','Tecno-Pedagógicas',7),
  ('PP','08','Normatividad',8),
  ('SIM','01','Cognitivas',1),
  ('SIM','02','Metacognitivas',2),
  ('SIM','03','Comunicativas',3),
  ('SIM','04','Sociales',4),
  ('SIM','05','Gestión de la Enseñanza',5),
  ('SIM','06','Afectivas',6),
  ('SIM','07','Tecno-Pedagógicas',7),
  ('SIM','08','Normatividad',8),
  ('AUTO','01','Cognitivas',1),
  ('AUTO','02','Metacognitivas',2),
  ('AUTO','03','Comunicativas',3),
  ('AUTO','04','Sociales',4),
  ('AUTO','05','Gestión de la Enseñanza',5),
  ('AUTO','06','Afectivas',6),
  ('AUTO','07','Tecno-Pedagógicas',7),
  ('AUTO','08','Normatividad',8)
) AS x(source_code, section_code, title, position)
JOIN public.instrument_definitions d ON d.code = CASE x.source_code
  WHEN 'CC' THEN 'observation_supervision_clinical'
  WHEN 'PP' THEN 'observation_professional_practice'
  WHEN 'SIM' THEN 'observation_simulation'
  WHEN 'AUTO' THEN 'observation_teaching_competencies'
END
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = 'v1.1'
;

INSERT INTO public.instrument_items(version_id, section_id, code, label, position, na_eligible, na_policy)
SELECT v.id, s.id, x.section_code || '_' || x.item_code, x.label, x.position, true,
  '{"when":"not_applicable_or_not_observable"}'::jsonb
FROM (VALUES
  ('CC','01','01','Domina los procedimientos clínicos y técnicas propias del campo asignado.',1),
  ('CC','01','02','Conoce los objetivos, competencias y actividades clínicas del programa académico.',2),
  ('CC','01','03','Explica claramente a los estudiantes sus funciones, alcances y responsabilidades clínicas.',3),
  ('CC','02','01','Promueve la reflexión clínica antes, durante y después de las actividades.',1),
  ('CC','02','02','Guía al estudiante para identificar errores y áreas de mejora clínica.',2),
  ('CC','02','03','Ajusta el nivel de supervisión según el desempeño y avance del estudiante.',3),
  ('CC','02','04','Fomenta el pensamiento crítico y la toma de decisiones seguras.',4),
  ('CC','03','01','Se comunica de forma clara, respetuosa y profesional con los estudiantes.',1),
  ('CC','03','02','Brinda indicaciones clínicas precisas en los momentos críticos del procedimiento.',2),
  ('CC','03','03','Mantiene comunicación adecuada con el personal de salud del servicio.',3),
  ('CC','04','01','Mantiene un ambiente clínico de respeto, ética y profesionalismo.',1),
  ('CC','04','02','Maneja conflictos o situaciones de tensión de manera objetiva y responsable.',2),
  ('CC','05','01','Permanece en la unidad de salud durante todo el horario de práctica del grupo.',1),
  ('CC','05','02','Supervisa de manera activa a los estudiantes asignados durante la jornada clínica.',2),
  ('CC','05','03','Verifica el cumplimiento de normas de bioseguridad y seguridad del paciente.',3),
  ('CC','05','04','Interviene oportunamente ante riesgos clínicos o errores críticos.',4),
  ('CC','05','05','Organiza las actividades clínicas conforme a la dinámica del servicio.',5),
  ('CC','05','06','Registra incidencias, avances y evaluaciones conforme a lineamientos institucionales.',6),
  ('CC','06','01','Genera un ambiente de confianza que favorece el aprendizaje clínico.',1),
  ('CC','06','02','Maneja adecuadamente sus emociones ante errores o situaciones críticas.',2),
  ('CC','07','01','Utiliza correctamente equipo clínico y recursos disponibles del servicio.',1),
  ('CC','07','02','Emplea formatos, registros o plataformas institucionales para el seguimiento.',2),
  ('CC','08','01','Conoce y cumple las normas del hospital y los convenios institucionales.',1),
  ('CC','08','02','Respeta lineamientos académicos y administrativos del campo clínico.',2),
  ('PP','01','01','Domina los elementos, lineamientos y reglamentación del proceso de prácticas profesionales.',1),
  ('PP','01','02','Explica de manera clara al estudiante las funciones, responsabilidades y entregables del proceso.',2),
  ('PP','01','03','Alinea el proyecto del estudiante con las competencias y propósitos del programa académico.',3),
  ('PP','02','01','Promueve que el estudiante reflexione sobre sus avances y áreas de mejora en su proyecto.',1),
  ('PP','02','02','Facilita el desarrollo del pensamiento crítico para la toma de decisiones dentro de su práctica.',2),
  ('PP','02','03','Ajusta estrategias de acompañamiento según las necesidades del estudiante.',3),
  ('PP','02','04','Orienta al estudiante para gestionar su tiempo, entregables y metas del proyecto.',4),
  ('PP','03','01','Mantiene comunicación clara y respetuosa con el estudiante durante el proceso.',1),
  ('PP','03','02','Expresa indicaciones precisas sobre actividades, avances y correcciones del proyecto.',2),
  ('PP','03','03','Facilita el diálogo entre estudiante–empresa–vinculación cuando es necesario.',3),
  ('PP','04','01','Mantiene un trato profesional y ético con el estudiante.',1),
  ('PP','04','02','Es objetivo y respetuoso durante la revisión de avances y dificultades del estudiante.',2),
  ('PP','05','01','Guía al estudiante en la organización y desarrollo del proyecto conforme al plan institucional.',1),
  ('PP','05','02','Establece metas y entregables claros para cada etapa del proceso.',2),
  ('PP','05','03','Realiza seguimiento constante del avance del estudiante mediante revisiones periódicas.',3),
  ('PP','05','04','Facilita estrategias de análisis, solución de problemas y mejora de desempeño.',4),
  ('PP','05','05','Promueve el profesionalismo, responsabilidad y cumplimiento del estudiante.',5),
  ('PP','05','06','Proporciona retroalimentación formativa basada en evidencia, ejemplos o estándares profesionales.',6),
  ('PP','06','01','Fomenta un ambiente de confianza que facilite el desarrollo del proyecto.',1),
  ('PP','06','02','Maneja con profesionalismo situaciones de estrés, conflicto o dificultades del estudiante.',2),
  ('PP','07','01','Utiliza recursos tecnológicos para seguimiento (Moodle, correo institucional, apps de gestión, documentos compartidos).',1),
  ('PP','07','02','Facilita herramientas digitales para la construcción, evidencia o presentación de avances del proyecto.',2),
  ('PP','08','01','Conoce y aplica correctamente los lineamientos institucionales de prácticas profesionales.',1),
  ('PP','08','02','Cumple con la entrega oportuna de reportes, seguimientos, validaciones y documentación.',2),
  ('SIM','01','01','Conoce el procedimiento clínico que se está evaluando.',1),
  ('SIM','01','02','Explica con precisión los objetivos clínicos del escenario.',2),
  ('SIM','01','03','Identifica correctamente pasos críticos y sus fundamentos.',3),
  ('SIM','01','04','Usa terminología técnica correcta y actualizada.',4),
  ('SIM','02','01','Promueve reflexión antes/durante/después del escenario.',1),
  ('SIM','02','02','Guía al estudiante a identificar errores y aciertos.',2),
  ('SIM','02','03','Favorece pensamiento crítico y razonamiento clínico.',3),
  ('SIM','02','04','Ayuda a conectar teoría–práctica.',4),
  ('SIM','03','01','Describe instrucciones de evaluación con claridad.',1),
  ('SIM','03','02','Comunica expectativas técnicas sin ambigüedad.',2),
  ('SIM','03','03','Retroalimenta con lenguaje técnico claro y respetuoso.',3),
  ('SIM','03','04','Facilita la expresión del estudiante durante el debriefing.',4),
  ('SIM','04','01','Mantiene trato digno, empático y profesional.',1),
  ('SIM','04','02','Evita favoritismos o conductas discriminatorias.',2),
  ('SIM','04','03','Facilita un ambiente seguro para el aprendizaje.',3),
  ('SIM','05','01','Realiza briefing – ejecución – debriefing de manera ordenada.',1),
  ('SIM','05','02','Mantiene el control de la estación o escenario.',2),
  ('SIM','05','03','Administra el tiempo de evaluación correctamente.',3),
  ('SIM','05','04','Mantiene congruencia entre evaluación, técnica y objetivos.',4),
  ('SIM','06','01','Reduce ansiedad del estudiante durante la evaluación.',1),
  ('SIM','06','02','Refuerza logros clínicos y habilidades.',2),
  ('SIM','06','03','Contiene emocionalmente en situaciones complejas.',3),
  ('SIM','07','01','Maneja el simulador (baja, media, alta) correctamente.',1),
  ('SIM','07','02','Usa lista de cotejo/OSCE de manera estandarizada.',2),
  ('SIM','07','03','Registra puntajes en tiempo real sin omitir criterios.',3),
  ('SIM','07','04','Utiliza recursos clínicos simulados adecuadamente.',4),
  ('SIM','08','01','Cumple normas del CSC y bioseguridad.',1),
  ('SIM','08','02','Supervisa que los estudiantes ejecuten técnicas seguras.',2),
  ('SIM','08','03','Respeta la integridad del equipo, simuladores y material.',3),
  ('SIM','08','04','Aplica protocolos institucionales de seguridad clínica.',4),
  ('AUTO','01','01','Domina los fundamentos técnicos, artísticos o deportivos de su taller.',1),
  ('AUTO','01','02','Explica de forma clara técnicas, reglas, conceptos o movimientos propios de la disciplina.',2),
  ('AUTO','01','03','Adecua sus explicaciones al nivel y experiencia del grupo.',3),
  ('AUTO','02','01','Promueve que los estudiantes reflexionen sobre su progreso en el taller.',1),
  ('AUTO','02','02','Fomenta la mejora continua a través de la práctica constante.',2),
  ('AUTO','02','03','Ajusta actividades según el desempeño observado del grupo.',3),
  ('AUTO','02','04','Ayuda a los estudiantes a identificar áreas de mejora en su desempeño.',4),
  ('AUTO','03','01','Se comunica de manera clara, respetuosa y motivadora.',1),
  ('AUTO','03','02','Brinda indicaciones precisas antes y durante las actividades prácticas.',2),
  ('AUTO','03','03','Escucha y atiende dudas o comentarios del grupo.',3),
  ('AUTO','04','01','Mantiene un ambiente de respeto, inclusión y convivencia sana.',1),
  ('AUTO','04','02','Maneja adecuadamente situaciones de disciplina o conflicto.',2),
  ('AUTO','05','01','Organiza las sesiones conforme al tiempo asignado.',1),
  ('AUTO','05','02','Planifica actividades prácticas acordes al objetivo del taller.',2),
  ('AUTO','05','03','Promueve la participación de todos los estudiantes.',3),
  ('AUTO','05','04','Da retroalimentación constructiva durante la práctica.',4),
  ('AUTO','05','05','Fomenta hábitos de disciplina, constancia y trabajo en equipo.',5),
  ('AUTO','05','06','Evalúa el desempeño de manera justa y formativa.',6),
  ('AUTO','06','01','Genera un ambiente motivador que favorece la confianza del estudiante.',1),
  ('AUTO','06','02','Maneja sus emociones de forma adecuada ante errores o frustración del grupo.',2),
  ('AUTO','07','01','Utiliza materiales, equipo o tecnología adecuados para el taller.',1),
  ('AUTO','07','02','Integra recursos digitales o audiovisuales cuando la disciplina lo permite.',2),
  ('AUTO','08','01','Conoce y cumple los lineamientos institucionales de Cultura y Deporte.',1),
  ('AUTO','08','02','Respeta horarios, normas de uso de espacios y cuidado del material.',2)
) AS x(source_code, section_code, item_code, label, position)
JOIN public.instrument_definitions d ON d.code = CASE x.source_code
  WHEN 'CC' THEN 'observation_supervision_clinical'
  WHEN 'PP' THEN 'observation_professional_practice'
  WHEN 'SIM' THEN 'observation_simulation'
  WHEN 'AUTO' THEN 'observation_teaching_competencies'
END
JOIN public.instrument_versions v ON v.definition_id = d.id AND v.version = 'v1.1'
JOIN public.instrument_sections s ON s.version_id = v.id AND s.code = x.section_code;

NOTIFY pgrst, 'reload schema';
