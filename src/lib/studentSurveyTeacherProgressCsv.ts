import { toCsv } from './csv';
import { formatPersonName } from './personName';
import type { TeacherProgress } from './studentSurveyTeacherProgress';

/** Export the displayed teachers in page order, with one row per subject. */
export function teacherProgressCsv(teachers: TeacherProgress[], cycleLabel: string): string {
  return toCsv([
    [
      'Ciclo', 'Docente', 'Estado del docente', 'Respondidas docente', 'Elegibles docente', 'Avance docente (%)',
      'Materia', 'Grupos', 'Respondidas materia', 'Elegibles materia', 'Avance materia (%)',
    ],
    ...teachers.flatMap((teacher) => teacher.subjects.map((subject) => [
      cycleLabel,
      formatPersonName(teacher.name),
      teacher.active ? 'Activo' : 'Inactivo',
      teacher.answered,
      teacher.eligible,
      Number(teacher.progress.toFixed(1)),
      subject.materia,
      subject.groups.join(' · '),
      subject.answered,
      subject.eligible,
      Number(subject.progress.toFixed(1)),
    ])),
  ]);
}
