import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentEvaluation = {
  groupId: number;
  teacherName: string;
  subjectKey: string;
  subjectName: string;
  groupKey: string;
  plan: string | null;
  modality: string | null;
  completed: boolean;
};

export type StudentEvaluationCycle = {
  id: number;
  key: string;
  name: string;
};

export type StudentEvaluations = {
  cycle: StudentEvaluationCycle | null;
  evaluations: StudentEvaluation[];
};

const emptyEvaluations: StudentEvaluations = { cycle: null, evaluations: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEvaluation(value: unknown): value is StudentEvaluation {
  return isRecord(value)
    && Number.isInteger(value.groupId)
    && typeof value.teacherName === 'string'
    && typeof value.subjectKey === 'string'
    && typeof value.subjectName === 'string'
    && typeof value.groupKey === 'string'
    && (typeof value.plan === 'string' || value.plan === null)
    && (typeof value.modality === 'string' || value.modality === null)
    && typeof value.completed === 'boolean';
}

export async function getCurrentStudentEvaluations(client: SupabaseClient): Promise<StudentEvaluations> {
  const { data, error } = await client.rpc('obtener_evaluaciones_estudiante_actual');
  if (error) throw error;
  if (!isRecord(data)) return emptyEvaluations;

  const cycle = isRecord(data.cycle)
    && Number.isInteger(data.cycle.id)
    && typeof data.cycle.key === 'string'
    && typeof data.cycle.name === 'string'
    ? { id: data.cycle.id as number, key: data.cycle.key, name: data.cycle.name }
    : null;
  const evaluations = Array.isArray(data.evaluations) ? data.evaluations.filter(isEvaluation) : [];

  return { cycle, evaluations };
}
