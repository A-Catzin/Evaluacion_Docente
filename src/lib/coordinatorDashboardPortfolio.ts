export type PortfolioTeacher = {
  id: number;
  nombre: string;
  apellidos: string;
  modalidad: string | null;
};

export type PlanningRecord = {
  docenteId: number;
  estado: string;
};

export type CoordinatedPortfolioRow = {
  teacher: PortfolioTeacher;
  coordinationCompleted: boolean;
  planningSubmitted: number;
  planningPending: number;
  planningReviewed: number;
  resultsAvailable: boolean;
};

export type ObservationPortfolioRow = {
  teacher: PortfolioTeacher;
  observationCompleted: boolean;
};

export function buildCoordinatedPortfolio(
  teachers: PortfolioTeacher[],
  completedCoordinationTeacherIds: Set<number>,
  planningRecords: PlanningRecord[],
  teacherIdsWithResults: Set<number>,
): CoordinatedPortfolioRow[] {
  return teachers.map((teacher) => {
    const plans = planningRecords.filter((plan) => plan.docenteId === teacher.id);
    const planningPending = plans.filter((plan) => plan.estado === "Pendiente").length;

    return {
      teacher,
      coordinationCompleted: completedCoordinationTeacherIds.has(teacher.id),
      planningSubmitted: plans.length,
      planningPending,
      planningReviewed: plans.length - planningPending,
      resultsAvailable: teacherIdsWithResults.has(teacher.id),
    };
  });
}

export function buildObservationPortfolio(
  teachers: PortfolioTeacher[],
  completedObservationTeacherIds: Set<number>,
): ObservationPortfolioRow[] {
  return teachers.map((teacher) => ({
    teacher,
    observationCompleted: completedObservationTeacherIds.has(teacher.id),
  }));
}

function withCycle(path: string, cycleId: number, teacherId?: number): string {
  const params = new URLSearchParams();
  if (cycleId > 0) params.set("cuatrimestre", String(cycleId));
  if (teacherId && teacherId > 0) params.set("docente_id", String(teacherId));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function coordinatedPortfolioLinks(cycleId: number, teacherId: number) {
  return {
    coordination: withCycle("/coordinador/captura/coordinacion", cycleId, teacherId),
    planning: withCycle("/coordinador/planeaciones", cycleId, teacherId),
    results: withCycle("/coordinador/reportes", cycleId, teacherId),
  };
}

export function observationPortfolioLinks(cycleId: number, teacherId: number) {
  return {
    observation: withCycle("/coordinador/captura/observacion", cycleId, teacherId),
  };
}
