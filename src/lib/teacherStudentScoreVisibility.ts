import { dbAdmin } from './db';
import { eligibleEnrollmentsByTeacher } from './instrumentNotDone';
import { meetsStudentParticipation, visibleStudentScore } from './studentParticipation';
import { fetchNativeStudentEvaluationScores, type NativeStudentEvaluationScore } from '../services/scoring';

// Teacher-facing visibility is independent of the minimum used in 360 scoring.
const TEACHER_STUDENT_VISIBILITY_MIN_PERCENT = 50;

export interface TeacherStudentScoreVisibility {
  canShowScore: boolean;
  message: string | null;
  description: string | null;
}

export function getTeacherStudentScoreVisibility(
  responses: number | null | undefined,
  eligible: number | null | undefined,
): TeacherStudentScoreVisibility {
  if (responses == null || eligible == null || !Number.isFinite(responses)
    || !Number.isFinite(eligible) || responses < 0 || eligible <= 0) {
    return {
      canShowScore: false,
      message: 'Participación estudiantil no disponible',
      description: 'Aún no se puede verificar la participación estudiantil de este ciclo. Intenta consultar más tarde.',
    };
  }
  const canShowScore = meetsStudentParticipation(responses, eligible, TEACHER_STUDENT_VISIBILITY_MIN_PERCENT);
  return {
    canShowScore,
    message: canShowScore ? null : 'Participación estudiantil baja',
    description: canShowScore ? null : 'La calificación estará disponible cuando participe al menos el 50 % del alumnado.',
  };
}

/** Both pages use the official score's teacher identity and selected cycle. */
export async function loadTeacherStudentScoreVisibility(
  docenteId: number | null | undefined,
  cuatrimestreId: number,
  nativeRows?: NativeStudentEvaluationScore[],
): Promise<TeacherStudentScoreVisibility> {
  if (!docenteId || !cuatrimestreId) return getTeacherStudentScoreVisibility(null, null);
  try {
    const client = dbAdmin();
    const [eligibleByTeacher, rows] = await Promise.all([
      eligibleEnrollmentsByTeacher(client, [docenteId], cuatrimestreId),
      nativeRows ?? fetchNativeStudentEvaluationScores(client, cuatrimestreId),
    ]);
    const responses = rows
      .filter((row) => row.docente_id === docenteId && row.cuatrimestre_id === cuatrimestreId)
      .reduce((total, row) => total + row.respuestas_validas, 0);
    return getTeacherStudentScoreVisibility(responses, eligibleByTeacher.get(docenteId) ?? 0);
  } catch {
    console.error('[teacher student score] Participation could not be verified');
    return getTeacherStudentScoreVisibility(null, null);
  }
}

export function teacherVisibleStudentScore(
  visibility: TeacherStudentScoreVisibility,
  teacherScore: number | null | undefined,
  detailScore: number | null | undefined = teacherScore,
): number | null {
  return visibility.canShowScore ? visibleStudentScore(teacherScore, detailScore) ?? null : null;
}
