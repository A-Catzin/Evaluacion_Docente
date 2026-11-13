import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ dbAdmin: vi.fn(() => client) }));
vi.mock('./instrumentNotDone', () => ({ eligibleEnrollmentsByTeacher: vi.fn() }));
vi.mock('../services/scoring', () => ({ fetchNativeStudentEvaluationScores: vi.fn() }));

import { eligibleEnrollmentsByTeacher } from './instrumentNotDone';
import { fetchNativeStudentEvaluationScores } from '../services/scoring';
import {
  getTeacherStudentScoreVisibility,
  loadTeacherStudentScoreVisibility,
  teacherVisibleStudentScore,
} from './teacherStudentScoreVisibility';

const client = {} as Parameters<typeof eligibleEnrollmentsByTeacher>[0];
const nativeRow = (docente_id: number, respuestas_validas: number, cuatrimestre_id = 11) => ({
  docente_id, respuestas_validas, cuatrimestre_id, asignatura_id: 2, grupo_id: 3,
  score_normalizado: 91, version_calculo: 'native-19-v2' as const,
});

describe('teacher student score visibility', () => {
  it('hides scores below 50 percent and explains the participation requirement', () => {
    const visibility = getTeacherStudentScoreVisibility(49, 100);
    expect(visibility.canShowScore).toBe(false);
    expect(visibility.message).toBe('Participación estudiantil baja');
    expect(visibility.description).toContain('50 %');
    expect(teacherVisibleStudentScore(visibility, 91)).toBeNull();
    expect(teacherVisibleStudentScore(visibility, 91, 100)).toBeNull();
    expect(getTeacherStudentScoreVisibility(1, 3).canShowScore).toBe(false);
  });

  it('shows the existing scores at exactly 50 percent and above, including zero', () => {
    for (const [responses, eligible] of [[50, 100], [1, 2], [51, 100]]) {
      const visibility = getTeacherStudentScoreVisibility(responses, eligible);
      expect(visibility.canShowScore).toBe(true);
      expect(visibility.message).toBeNull();
      expect(teacherVisibleStudentScore(visibility, 91)).toBe(91);
      expect(teacherVisibleStudentScore(visibility, 91, 85)).toBe(85);
      expect(teacherVisibleStudentScore(visibility, 0, 0)).toBe(0);
      expect(teacherVisibleStudentScore(visibility, null, 100)).toBeNull();
    }
  });

  it('keeps zero participation hidden and does not call unknown counts low participation', () => {
    expect(getTeacherStudentScoreVisibility(0, 10).message).toBe('Participación estudiantil baja');
    for (const [responses, eligible] of [[null, null], [NaN, 10], [1, undefined], [1, 0]]) {
      const visibility = getTeacherStudentScoreVisibility(responses, eligible);
      expect(visibility.canShowScore).toBe(false);
      expect(visibility.message).toBe('Participación estudiantil no disponible');
    }
  });
});

describe('selected teacher and cycle participation loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eligibleEnrollmentsByTeacher).mockResolvedValue(new Map([[152, 100]]));
    vi.mocked(fetchNativeStudentEvaluationScores).mockResolvedValue([
      nativeRow(152, 49), nativeRow(415, 100), nativeRow(152, 100, 10),
    ]);
  });

  it('uses native valid responses and eligible enrollments for the same teacher and cycle', async () => {
    const visibility = await loadTeacherStudentScoreVisibility(152, 11);
    expect(visibility.canShowScore).toBe(false);
    expect(eligibleEnrollmentsByTeacher).toHaveBeenCalledWith(client, [152], 11);
    expect(fetchNativeStudentEvaluationScores).toHaveBeenCalledWith(client, 11);
  });

  it('reuses all teacher rows on subject pages, not only the selected subject', async () => {
    const visibility = await loadTeacherStudentScoreVisibility(152, 11, [
      nativeRow(152, 25), { ...nativeRow(152, 25), asignatura_id: 4 },
    ]);
    expect(visibility.canShowScore).toBe(true);
    expect(fetchNativeStudentEvaluationScores).not.toHaveBeenCalled();
  });

  it('hides the score if participation cannot be loaded', async () => {
    vi.mocked(eligibleEnrollmentsByTeacher).mockRejectedValue(new Error('unavailable'));
    const visibility = await loadTeacherStudentScoreVisibility(152, 11);
    expect(visibility.canShowScore).toBe(false);
    expect(visibility.message).toBe('Participación estudiantil no disponible');
  });
});

describe('teacher page wiring', () => {
  const dashboard = readFileSync(new URL('../pages/docente/dashboard.astro', import.meta.url), 'utf8');
  const subject = readFileSync(new URL('../pages/docente/materia/[asignaturaId].astro', import.meta.url), 'utf8');

  it('masks dashboard scores before rendering KPI, chart and legend, and gates instrument item details', () => {
    expect(dashboard).toContain('loadTeacherStudentScoreVisibility(docenteIdParaScore, cuatrimestreId)');
    expect(dashboard).toContain('scores.promEst = teacherVisibleStudentScore(studentVisibility, scores.promEst) ?? undefined');
    expect(dashboard).toContain('!studentVisibility.canShowScore ? (');
    expect(dashboard).toContain('studentVisibility.message');
    expect(dashboard).toContain('studentVisibility.description');
  });

  it('applies the same teacher-wide visibility to subject scores without changing the global grade', () => {
    expect(subject).toContain('loadTeacherStudentScoreVisibility(entidadId, cuatrimestreId, teacherEeRows)');
    expect(subject).toContain('teacherVisibleStudentScore(studentVisibility, calificacionFinal?.score_encuesta_estudiantil, eeAvgRaw)');
    expect(subject).toContain('studentVisibility.message');
    expect(subject).toContain('formatScore(calificacionFinal?.calificacion_final)');
  });
});
