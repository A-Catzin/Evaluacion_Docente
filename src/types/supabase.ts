/**
 * Tipos TypeScript — SED-360 v2
 *
 * Refleja el nuevo esquema de 4 roles, 5 instrumentos y calificación final.
 */

// ─── Roles ──────────────────────────────────────────────────────

export type RolUsuario = 'superadmin' | 'coordinador' | 'docente' | 'estudiante';

// ─── Catálogo ──────────────────────────────────────────────────

export interface Cuatrimestre {
  id: number;
  clave: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  cerrado: boolean;
}

export interface Licenciatura {
  id: number;
  clave: string;
  nombre: string;
  facultad: string | null;
  activa: boolean;
}

export interface Docente {
  id: number;
  nombre: string;
  apellidos: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  email: string;
  num_empleado: string | null;
  licenciatura_id: number | null;
  foto_url: string | null;
  campus?: string | null;
  turno?: string | null;
  oferta_academica?: string | null;
  activo: boolean;
}

export interface Asignatura {
  id: number;
  clave: string;
  nombre: string;
  licenciatura_id: number | null;
  cuatrimestre_num: number | null;
  creditos: number;
  activa: boolean;
}

export interface Grupo {
  id: number;
  clave: string;
  asignatura_id: number | null;
  docente_id: number | null;
  cuatrimestre_id: number | null;
  num_alumnos: number;
  activo: boolean;
}

export interface Estudiante {
  id: number;
  nombre: string;
  apellidos: string;
  email: string;
  matricula: string;
  licenciatura_id: number | null;
  cuatrimestre_actual: number | null;
  activo: boolean;
}

export interface Inscripcion {
  id: number;
  estudiante_id: number;
  grupo_id: number;
  cuatrimestre_id: number;
  fecha: string;
}

export interface Usuario {
  id: string;
  email: string;
  rol: RolUsuario;
  entidad_id: number | null;
  activo: boolean;
  ultimo_acceso: string | null;
}

// ─── Instrumentos ───────────────────────────────────────────────

export interface EncuestaEstudiantilRespuesta {
  id: number;
  docente_id: number;
  grupo_id: number;
  cuatrimestre_id: number;
  calidad_general: number; // 1-6
  item_plan_estudio: number | null;
  item_trato_respeto: number | null;
  item_asistencia: number | null;
  item_puntualidad: number | null;
  item_participacion: number | null;
  item_dominio_materia: number | null;
  item_plataforma_moodle: number | null;
  item_pensamiento_critico: number | null;
  item_desafio_intelectual: number | null;
  item_claridad_objetivos: number | null;
  item_lecturas_aprendizaje: number | null;
  item_respeto_reglas: number | null;
  item_interes_materia: number | null;
  item_apoyos_didacticos: number | null;
  item_actitudes_valores: number | null;
  item_retroalimentacion: number | null;
  item_criterios_evaluacion: number | null;
  item_receptividad: number | null;
  comentario_abierto: string | null;
  clasificacion_comentario: string;
}

export interface EvaluacionCoordinacion {
  id: number;
  docente_id: number;
  coordinador_id: string;
  cuatrimestre_id: number;
  puntos_obtenidos: number; // 0-75
  categoria: string;
  score_normalizado: number;
  observaciones: string | null;
}

export interface EvaluacionPlaneacion {
  id: number;
  docente_id: number;
  evaluador_id: string;
  cuatrimestre_id: number;
  asignatura_id: number;
  puntos_totales: number; // 0-22 (generado)
  categoria: string | null;
  score_normalizado: number;
}

export interface ObservacionClase {
  id: number;
  docente_id: number;
  observador_id: string;
  cuatrimestre_id: number;
  grupo_id: number;
  puntuacion_total: number; // 0-10
  categoria: string;
  score_normalizado: number;
  observaciones: string | null;
  recomendaciones: string | null;
}

export interface AutoevaluacionDocente {
  id: number;
  docente_id: number;
  cuatrimestre_id: number;
  score_normalizado: number;
  categoria: string | null;
  reflexion_personal: string | null;
}

export interface CalificacionFinal {
  id: number;
  docente_id: number;
  cuatrimestre_id: number;
  score_encuesta_estudiantil: number | null;
  score_coordinacion: number | null;
  score_planeacion: number | null;
  score_observacion: number | null;
  score_autoevaluacion: number | null;
  calificacion_final: number;
  categoria_final: string | null;
  tiene_comentarios_foco_rojo?: boolean;
  tiene_comentarios_criticos?: boolean;
  num_instrumentos_completados: number;
}

// ─── Autodiagnóstico ───────────────────────────────────────────

export interface Autodiagnostico {
  id: number;
  docente_id: number;
  cuatrimestre_id: number;
  r1: number; r2: number; r3: number; r4: number; r5: number;
  r6: number; r7: number; r8: number; r9: number; r10: number;
  r11: number; r12: number; r13: number; r14: number; r15: number;
  r16: number; r17: number; r18: number; r19: number; r20: number;
  r21: number; r22: number; r23: number; r24: number;
  puntaje_total: number;
  nivel_desempeno: string | null;
  comentarios: string | null;
  fecha_respuesta: string;
}

export const NIVELES_DESEMPENO = [
  { min: 90, max: 100, nivel: 'Excelente', color: '#22c55e' },
  { min: 75, max: 89, nivel: 'Satisfactorio', color: '#3b82f6' },
  { min: 60, max: 74, nivel: 'En Desarrollo', color: '#f59e0b' },
  { min: 0, max: 59, nivel: 'Necesita Mejora', color: '#ef4444' },
] as const;

export interface OfertaAcademica {
  id: number;
  nombre: string;
  activa: boolean;
}

export interface Campus {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Turno {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Observacion {
  id: number; docente_id: number; evaluador_id: string;
  oferta_academica: string; cuatrimestre_grupo: string; ciclo: string; campus: string;
  cco1: number|null; cco2: number|null; cco3: number|null; cco4: number|null; cco5: number|null; cco6: number|null; cco7: number|null;
  cme1: number|null; cme2: number|null; cme3: number|null; cme4: number|null; cme5: number|null; cme6: number|null; cme7: number|null; cme8: number|null; cme9: number|null;
  ccom1: number|null; ccom2: number|null; ccom3: number|null; ccom4: number|null;
  cso1: number|null; cso2: number|null; cso3: number|null; cso4: number|null;
  cge1: number|null; cge2: number|null; cge3: number|null; cge4: number|null; cge5: number|null; cge6: number|null; cge7: number|null;
  caf1: number|null; caf2: number|null;
  ctepe1: number|null; ctepe2: number|null; ctepe3: number|null; ctepe4: number|null; ctepe5: number|null; ctepe6: number|null; ctepe7: number|null;
  cno1: number|null; cno2: number|null; cno3: number|null; cno4: number|null; cno5: number|null;
  obs_cognitivas: string|null; obs_metacognitivas: string|null; obs_comunicativas: string|null; obs_sociales: string|null;
  obs_gestion: string|null; obs_afectivas: string|null; obs_tecno: string|null; obs_normativa: string|null;
  comentario_docente: string|null; comentario_evaluador: string|null;
  fecha_observacion: string;
}

export function obtenerNivelDesempeno(promedio: number): { nivel: string; color: string } {
  for (const n of NIVELES_DESEMPENO) {
    if (promedio >= n.min && promedio <= n.max) return n;
  }
  return NIVELES_DESEMPENO[3];
}

export const PONDERACION_V2 = {
  EE: 0.40, // Encuesta Estudiantil
  CA: 0.25, // Coordinación Académica
  PD: 0.15, // Planeación Docente
  OC: 0.15, // Observación de Clase
  AE: 0.05, // Auto-evaluación
} as const;

export const CATEGORIAS_FINAL = {
  SOBRESALIENTE: { min: 90, max: 100, color: '#22c55e', label: 'Sobresaliente' },
  DISTINGUIDO: { min: 80, max: 89, color: '#3b82f6', label: 'Distinguido' },
  BUENO: { min: 70, max: 79, color: '#a855f7', label: 'Bueno' },
  APROBADO: { min: 60, max: 69, color: '#f59e0b', label: 'Aprobado' },
  A_MEJORAR: { min: 50, max: 59, color: '#f97316', label: 'A mejorar' },
  INSUFICIENTE: { min: 0, max: 49, color: '#ef4444', label: 'Insuficiente' },
} as const;

export function obtenerCategoria(puntaje: number): { label: string; color: string } {
  for (const [, cat] of Object.entries(CATEGORIAS_FINAL)) {
    if (puntaje >= cat.min && puntaje <= cat.max) return cat;
  }
  return CATEGORIAS_FINAL.INSUFICIENTE;
}
