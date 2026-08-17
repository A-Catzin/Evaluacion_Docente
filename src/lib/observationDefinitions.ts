export const OBSERVATION_INSTRUMENT_VERSIONS = [
  'escolarizado-v1',
  'virtual-v1',
  'ejecutivo-v1',
] as const;

export type ObservationInstrumentVersion = (typeof OBSERVATION_INSTRUMENT_VERSIONS)[number];

type ObservationInstrumentDefinition = {
  readonly sections: readonly {
    readonly code: string;
    readonly id: string;
    readonly title: string;
    readonly fields: readonly { readonly key: string; readonly text: string }[];
  }[];
};

export const OBSERVATION_INSTRUMENT_DEFINITIONS = {
  'escolarizado-v1': {
    sections: [
      { code: 'A', id: 'cco', title: 'A. Cognitivas (7 reactivos)', fields: [
        { key: 'cco1', text: 'Expone, organiza, desarrolla y vincula los contenidos en forma clara.' },
        { key: 'cco2', text: 'Relaciona los contenidos con situaciones reales o casos prácticos.' },
        { key: 'cco3', text: 'Adapta los contenidos a los diversos estilos y necesidades.' },
        { key: 'cco4', text: 'Explica conceptos complejos utilizando analogías y ejemplos claros.' },
        { key: 'cco5', text: 'Clarifica términos técnicos según el nivel académico del grupo.' },
        { key: 'cco6', text: 'Facilita la apropiación del conocimiento mediante explicaciones.' },
        { key: 'cco7', text: 'Promueve el razonamiento crítico y la resolución de problemas.' },
      ] },
      { code: 'B', id: 'cme', title: 'B. Metacognitivas (9 reactivos)', fields: [
        { key: 'cme1', text: 'Organiza espacios de reflexión antes, durante y después de las actividades.' },
        { key: 'cme2', text: 'Orienta a los estudiantes para que identifiquen fortalezas y áreas de oportunidad.' },
        { key: 'cme3', text: 'Incluye actividades que promueven el aprendizaje autónomo.' },
        { key: 'cme4', text: 'Propone ejercicios para promover la metacognición.' },
        { key: 'cme5', text: 'Propone nuevas estrategias para mejorar los resultados.' },
        { key: 'cme6', text: 'Favorece la transferencia de conocimientos a nuevas situaciones.' },
        { key: 'cme7', text: 'Promueve la formulación de preguntas y pensamiento reflexivo.' },
        { key: 'cme8', text: 'Invita a seleccionar estrategias de estudio adaptadas.' },
        { key: 'cme9', text: 'Integra momentos de análisis sobre errores como oportunidades.' },
      ] },
      { code: 'C', id: 'ccom', title: 'C. Comunicativas (4 reactivos)', fields: [
        { key: 'ccom1', text: 'Se comunica con lenguaje oral y escrito apropiado y de respeto.' },
        { key: 'ccom2', text: 'Se comunica con lenguaje no verbal apropiado y de respeto.' },
        { key: 'ccom3', text: 'Comunica propósitos, procedimientos y resultados esperados.' },
        { key: 'ccom4', text: 'Diseña actividades que desarrollen expresión escrita y oral.' },
      ] },
      { code: 'D', id: 'cso', title: 'D. Sociales (4 reactivos)', fields: [
        { key: 'cso1', text: 'Procura relaciones empáticas y de respeto en la praxis docente.' },
        { key: 'cso2', text: 'Proporciona igualdad de oportunidades de participación.' },
        { key: 'cso3', text: 'Promueve compromiso y solidaridad entre los estudiantes.' },
        { key: 'cso4', text: 'Establece un clima de relaciones interpersonales respetuosas.' },
      ] },
      { code: 'E', id: 'cge', title: 'E. Gestión de la Enseñanza (7 reactivos)', fields: [
        { key: 'cge1', text: 'Organiza objetivos y contenidos de manera coherente con el modelo TUP.' },
        { key: 'cge2', text: 'Implementa diversas estrategias para aprendizaje significativo.' },
        { key: 'cge3', text: 'Considera saberes previos, intereses y experiencias.' },
        { key: 'cge4', text: 'Genera oportunidades de pensamiento crítico y creativo.' },
        { key: 'cge5', text: 'Motiva al aprendizaje, la indagación y búsqueda de conocimiento.' },
        { key: 'cge6', text: 'Integra recursos tecnológicos, didácticos y materiales.' },
        { key: 'cge7', text: 'Ofrece retroalimentación oportuna, pertinente y cálida.' },
      ] },
      { code: 'F', id: 'caf', title: 'F. Afectivas (2 reactivos)', fields: [
        { key: 'caf1', text: 'Genera un ambiente de confianza, seguridad y respeto.' },
        { key: 'caf2', text: 'Identifica fortalezas de sus estudiantes y las destaca.' },
      ] },
      { code: 'G', id: 'ctepe', title: 'G. Tecno-Pedagógicas (7 reactivos)', fields: [
        { key: 'ctepe1', text: 'Diseña tareas integradoras de proyectos usando NTIC.' },
        { key: 'ctepe2', text: 'Promueve empoderamiento del estudiante en uso de NTIC.' },
        { key: 'ctepe3', text: 'Muestra dominio de la tecnología como recurso para enseñanza.' },
        { key: 'ctepe4', text: 'Aplica métodos y técnicas pertinentes a la didáctica de su campo.' },
        { key: 'ctepe5', text: 'Identifica estrategias de enseñanza y dificultades recurrentes.' },
        { key: 'ctepe6', text: 'Promueve uso responsable, ético y seguro de tecnologías.' },
        { key: 'ctepe7', text: 'Genera situaciones de aprendizaje adecuadas a niveles de desarrollo.' },
      ] },
      { code: 'H', id: 'cno', title: 'H. Normativa (5 reactivos)', fields: [
        { key: 'cno1', text: 'Inicia puntualmente su sesión.' },
        { key: 'cno2', text: 'Entrega en tiempo y forma la planeación docente.' },
        { key: 'cno3', text: 'Desarrolla el tema correspondiente a la semana establecida.' },
        { key: 'cno4', text: 'Registra asistencia, evaluaciones y avances.' },
        { key: 'cno5', text: 'Concluye su sesión en el tiempo señalado.' },
      ] },
    ],
  },
  'virtual-v1': {
    sections: [
      { code: 'A', id: 'cco', title: 'A. Cognitiva', fields: [
        { key: 'cco1', text: 'Organización y vinculación de contenidos con recursos digitales.' },
        { key: 'cco2', text: 'Uso de ejemplos y casos contextualizados al entorno en línea.' },
        { key: 'cco3', text: 'Adaptación ante limitaciones tecnológicas del grupo.' },
        { key: 'cco4', text: 'Uso de apoyos visuales (gráficas, pizarras virtuales) para clarificar conceptos.' },
        { key: 'cco5', text: 'Clarificación de términos técnicos con herramientas digitales.' },
        { key: 'cco6', text: 'Promoción del razonamiento crítico (breakout rooms, debates).' },
      ] },
      { code: 'B', id: 'cme', title: 'B. Metacognitiva', fields: [
        { key: 'cme1', text: 'Generación de reflexión mediante foros o chats.' },
        { key: 'cme2', text: 'Orientación sobre fortalezas y áreas de oportunidad.' },
        { key: 'cme3', text: 'Fomento del aprendizaje autónomo y gestión propia en línea.' },
        { key: 'cme4', text: 'Actividades de recapitulación o autoevaluaciones digitales.' },
      ] },
      { code: 'C', id: 'ccom', title: 'C. Comunicativa', fields: [
        { key: 'ccom1', text: 'Claridad en voz, dicción, ritmo y volumen.' },
        { key: 'ccom2', text: 'Manejo respetuoso de chats y turnos de voz.' },
        { key: 'ccom3', text: 'Explicación de dinámicas con lenguaje accesible.' },
        { key: 'ccom4', text: 'Comunicación de propósitos y resultados esperados.' },
        { key: 'ccom5', text: 'Verificación de comprensión (encuestas, reacciones).' },
      ] },
      { code: 'D', id: 'cso', title: 'D. Social y Afectiva', fields: [
        { key: 'cso1', text: 'Clima de respeto, participación equitativa y manejo de imprevistos técnicos.' },
        { key: 'cso2', text: 'Ambiente de confianza y manejo cálido de la baja participación (cámaras apagadas).' },
      ] },
      { code: 'E', id: 'cge', title: 'E. Gestión y Tecno-Pedagogía', fields: [
        { key: 'cge1', text: 'Alineación con la planeación y uso de estrategias activas (Kahoot, Jamboard).' },
        { key: 'cge2', text: 'Dominio de la plataforma virtual y promoción del uso ético de la tecnología.' },
      ] },
      { code: 'F', id: 'cno', title: 'F. Normativa', fields: [
        { key: 'cno1', text: 'Inicio puntual, desarrollo conforme al calendario y respeto a la duración de la sesión.' },
      ] },
    ],
  },
  'ejecutivo-v1': {
    sections: [
      { code: 'A', id: 'cco', title: 'A. Cognitiva', fields: [
        { key: 'cco1', text: 'Claridad, síntesis y precisión en la explicación de contenidos clave.' },
        { key: 'cco2', text: 'Vinculación de aprendizajes previos con temas actuales.' },
        { key: 'cco3', text: 'Integración efectiva de contenidos de Moodle con la sesión presencial.' },
        { key: 'cco4', text: 'Aclaración de conceptos esenciales para el trabajo autónomo semanal.' },
      ] },
      { code: 'B', id: 'cme', title: 'B. Metacognitiva', fields: [
        { key: 'cme1', text: 'Reflexión sobre los avances logrados durante la semana previa.' },
        { key: 'cme2', text: 'Orientación sobre estrategias de organización para el trabajo independiente.' },
        { key: 'cme3', text: 'Retroalimentación sobre errores comunes detectados en plataforma.' },
        { key: 'cme4', text: 'Propuesta de momentos de autoevaluación del progreso.' },
      ] },
      { code: 'C', id: 'ccom', title: 'C. Comunicativa', fields: [
        { key: 'ccom1', text: 'Comunicación clara, ordenada y con secuencia lógica.' },
        { key: 'ccom2', text: 'Claridad en las instrucciones de tareas y actividades en Moodle.' },
        { key: 'ccom3', text: 'Apertura del ambiente para la expresión de dudas.' },
        { key: 'ccom4', text: 'Verificación de comprensión antes de finalizar bloques temáticos.' },
      ] },
      { code: 'D', id: 'cso', title: 'D. Social y Afectiva', fields: [
        { key: 'cso1', text: 'Reconocimiento de la carga laboral del estudiante ejecutivo y participación inclusiva.' },
        { key: 'cso2', text: 'Clima de empatía, motivación al proceso independiente y reconocimiento de avances.' },
      ] },
      { code: 'E', id: 'cge', title: 'E. Gestión, Tecno-Pedagogía y Normativa', fields: [
        { key: 'cge1', text: 'Administración óptima del tiempo en bloques compactos y alineación con Moodle.' },
        { key: 'cge2', text: 'Manejo de Moodle como herramienta central y retroalimentación mediante plataforma.' },
        { key: 'cge3', text: 'Puntualidad sabatina, desarrollo según programa ejecutivo y registro de evidencias.' },
      ] },
    ],
  },
} as const satisfies Record<ObservationInstrumentVersion, ObservationInstrumentDefinition>;

export const OBSERVATION_STORAGE_SECTIONS = [
  { code: 'A', title: 'Cognitivas', fields: ['cco1', 'cco2', 'cco3', 'cco4', 'cco5', 'cco6', 'cco7'] },
  { code: 'B', title: 'Metacognitivas', fields: ['cme1', 'cme2', 'cme3', 'cme4', 'cme5', 'cme6', 'cme7', 'cme8', 'cme9'] },
  { code: 'C', title: 'Comunicativas', fields: ['ccom1', 'ccom2', 'ccom3', 'ccom4'] },
  { code: 'D', title: 'Sociales', fields: ['cso1', 'cso2', 'cso3', 'cso4'] },
  { code: 'E', title: 'Gestión de la enseñanza', fields: ['cge1', 'cge2', 'cge3', 'cge4', 'cge5', 'cge6', 'cge7'] },
  { code: 'F', title: 'Afectivas', fields: ['caf1', 'caf2'] },
  { code: 'G', title: 'Tecno-pedagógicas', fields: ['ctepe1', 'ctepe2', 'ctepe3', 'ctepe4', 'ctepe5', 'ctepe6', 'ctepe7'] },
  { code: 'H', title: 'Normativas', fields: ['cno1', 'cno2', 'cno3', 'cno4', 'cno5'] },
] as const;

export function isObservationInstrumentVersion(value: unknown): value is ObservationInstrumentVersion {
  return typeof value === 'string' && (OBSERVATION_INSTRUMENT_VERSIONS as readonly string[]).includes(value);
}

export function getObservationQuestion(version: ObservationInstrumentVersion, field: string): string | null {
  for (const section of OBSERVATION_INSTRUMENT_DEFINITIONS[version].sections) {
    const question = section.fields.find((item) => item.key === field);
    if (question) return question.text;
  }
  return null;
}
