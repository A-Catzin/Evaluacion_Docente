import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "./personName";

// Specialized 20-item forms, keyed as stored in grupos.instrumento_encuesta.
export const SPECIALIZED_INSTRUMENT_CODES = {
  "cd07-v1": "SED-360-INST-EST-CD-07-V1.1",
  "pp04-v1": "SED-360-INST-EST-PP-04-V1.1",
  "sim05-v1": "SED-360-INST-EST-SIM-05-V1.1",
  "cc06-v1": "SED-360-INST-EST-CC-06-V1.1",
} as const;

export type SpecializedInstrument = keyof typeof SPECIALIZED_INSTRUMENT_CODES;
export type StudentEvaluationInstrument = "general-19" | SpecializedInstrument;

export function isSpecializedInstrument(
  value: unknown,
): value is SpecializedInstrument {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SPECIALIZED_INSTRUMENT_CODES, value)
  );
}

export function specializedInstrumentFromCode(
  code: string,
): SpecializedInstrument | null {
  const entry = Object.entries(SPECIALIZED_INSTRUMENT_CODES).find(
    ([, value]) => value === code,
  );
  return entry ? (entry[0] as SpecializedInstrument) : null;
}

export type StudentEvaluation = {
  groupId: number;
  teacherName: string;
  subjectKey: string;
  subjectName: string;
  groupKey: string;
  plan: string | null;
  modality: string | null;
  instrument: StudentEvaluationInstrument;
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
  return typeof value === "object" && value !== null;
}

function isEvaluation(value: unknown): value is StudentEvaluation {
  return (
    isRecord(value) &&
    Number.isInteger(value.groupId) &&
    typeof value.teacherName === "string" &&
    typeof value.subjectKey === "string" &&
    typeof value.subjectName === "string" &&
    typeof value.groupKey === "string" &&
    (typeof value.plan === "string" || value.plan === null) &&
    (typeof value.modality === "string" || value.modality === null) &&
    // Unknown instruments are dropped so no group falls back to the wrong form.
    (value.instrument === "general-19" ||
      isSpecializedInstrument(value.instrument)) &&
    typeof value.completed === "boolean"
  );
}

export async function getCurrentStudentEvaluations(
  client: SupabaseClient,
): Promise<StudentEvaluations> {
  const { data, error } = await client.rpc(
    "obtener_evaluaciones_estudiante_actual",
  );
  if (error) throw error;
  if (!isRecord(data)) return emptyEvaluations;

  const cycle =
    isRecord(data.cycle) &&
    Number.isInteger(data.cycle.id) &&
    typeof data.cycle.key === "string" &&
    typeof data.cycle.name === "string"
      ? {
          id: data.cycle.id as number,
          key: data.cycle.key,
          name: data.cycle.name,
        }
      : null;
  const evaluations = Array.isArray(data.evaluations)
    ? data.evaluations.filter(isEvaluation).map((evaluation) => ({
        ...evaluation,
        teacherName: formatPersonName(evaluation.teacherName),
      }))
    : [];

  return { cycle, evaluations };
}
