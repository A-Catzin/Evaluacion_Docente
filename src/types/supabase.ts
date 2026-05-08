/**
 * Tipos TypeScript — Plataforma SED-360
 *
 * Refleja el esquema SQL definido en docs/requerimientos.md v2.0
 *
 * Tablas core:
 * - usuarios (sincronizado con auth.users de Supabase)
 * - cargas_academicas (nexo docente-materia-periodo)
 * - evaluaciones (captura de evaluaciones con constraint unique_vote)
 */

// ─── Roles de Usuario ───────────────────────────────────────────

/** Roles del sistema según el flujo 360° */
export type RolUsuario =
  | 'alumno'
  | 'docente'
  | 'coordinador'
  | 'tecnico'
  | 'calidad'
  | 'admin';

// ─── Tabla: usuarios ────────────────────────────────────────────

/** Usuario del sistema sincronizado con auth.users de Supabase */
export interface Usuario {
  id: string; // UUID → auth.users
  email: string;
  rol: RolUsuario;
}

// ─── Tabla: cargas_academicas ───────────────────────────────────

/** Carga académica: relación docente-materia en un periodo */
export interface CargaAcademica {
  id_carga: number; // SERIAL
  id_docente: string; // UUID → usuarios.id
  id_materia: string;
  id_periodo: string; // Ej: "2025-1"
}

// ─── Tabla: evaluaciones ───────────────────────────────────────

/** Tipos de actor evaluador (coincide con el CHECK SQL) */
export type TipoActor = 'ALUMNO' | 'COORDINADOR' | 'TECNICO' | 'CALIDAD' | 'AUTO';

/** Evaluación capturada por un actor sobre una carga académica */
export interface Evaluacion {
  id_evaluacion: number; // SERIAL
  id_evaluador: string; // UUID → usuarios.id
  id_carga: number; // → cargas_academicas.id_carga
  tipo_actor: TipoActor;
  puntaje_promedio: number; // DECIMAL(5,2)
  comentario: string | null;
  marcado_inapropiado: boolean;
  fecha_creacion: string; // TIMESTAMP
}

// ─── Escala Likert ──────────────────────────────────────────────

/** Valores de la escala Likert (1 a 5) */
export type ValorLikert = 1 | 2 | 3 | 4 | 5;

/** Etiquetas descriptivas de la escala Likert */
export const ETIQUETAS_LIKERT: Record<ValorLikert, string> = {
  1: 'Totalmente en desacuerdo',
  2: 'En desacuerdo',
  3: 'Neutral',
  4: 'De acuerdo',
  5: 'Totalmente de acuerdo',
};

// ─── Ponderación 360° ──────────────────────────────────────────

/**
 * Pesos del algoritmo de Ponderación 360°.
 * Definidos por el manual institucional (docs/contexto.md).
 */
export const PONDERACION_360 = {
  ALUMNO: 0.35, // Evaluación Estudiantil
  TECNICO: 0.25, // Observación de Clase
  COORDINADOR: 0.2, // Evaluación por Coordinación
  CALIDAD: 0.15, // Evaluación de Planeación
  AUTO: 0.05, // Autoevaluación del Docente
} as const;

/** Verifica que los pesos sumen 1.0 (100%) */
export const PESOS_TOTALES = Object.values(PONDERACION_360).reduce(
  (suma, peso) => suma + peso,
  0
); // Debe ser 1.0

// ─── Tabla: periodos ──────────────────────────────────────────────

/** Periodo académico */
export interface Periodo {
  id_periodo: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
}

// ─── Vista Materializada: resultados_agregados ───────────────────

/** Resultado agregado por carga académica desde la MV */
export interface ResultadoAgregado {
  id_carga: number;
  id_docente: string;
  id_materia: string;
  id_periodo: string;
  promedio_alumno: number | null;
  total_alumno: number;
  promedio_coordinador: number | null;
  total_coordinador: number;
  promedio_tecnico: number | null;
  total_tecnico: number;
  promedio_calidad: number | null;
  total_calidad: number;
  promedio_auto: number | null;
  total_auto: number;
}

/** Etiquetas legibles para cada tipo de actor */
export const ETIQUETAS_ACTOR: Record<TipoActor, string> = {
  ALUMNO: 'Evaluación Estudiantil',
  COORDINADOR: 'Evaluación por Coordinación',
  TECNICO: 'Observación de Clase',
  CALIDAD: 'Evaluación de Planeación',
  AUTO: 'Autoevaluación',
};
