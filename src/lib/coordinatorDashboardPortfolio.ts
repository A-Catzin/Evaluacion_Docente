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
  observationScore: number | null;
};

export function buildCoordinatedPortfolio(
  teachers: PortfolioTeacher[],
  completedCoordinationTeacherIds: Set<number>,
  planningRecords: PlanningRecord[],
  teacherIdsWithResults: Set<number>,
): CoordinatedPortfolioRow[] {
  return teachers.map((teacher) => {
    const plans = planningRecords.filter(
      (plan) => plan.docenteId === teacher.id,
    );
    const planningPending = plans.filter(
      (plan) => plan.estado === "Pendiente",
    ).length;

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

type VersionedObservation = {
  id: number | string;
  docente_id: number;
  submitted_by: string | null;
  submitted_at: string | null;
  normalized_score: number | null;
  validity_status: string | null;
};

type LegacyObservation = {
  docente_id: number;
  evaluador_id: string | null;
  score_normalizado: number | null;
};

export function summarizeObserverObservations(
  versioned: VersionedObservation[],
  legacy: LegacyObservation[],
  actorId: string,
) {
  const completedTeacherIds = new Set<number>();
  const ownLatestScores = new Map<number, number | null>();
  const supersededTeacherIds = new Set<number>();
  if (!actorId) return { completedTeacherIds, ownLatestScores, supersededTeacherIds };

  const ordered = [...versioned].sort((a, b) =>
    (b.submitted_at || '').localeCompare(a.submitted_at || '') ||
    String(b.id).localeCompare(String(a.id), undefined, { numeric: true }),
  );
  const globalLatest = new Map<number, VersionedObservation>();
  const ownLatest = new Map<number, VersionedObservation>();
  for (const row of ordered) {
    if (!globalLatest.has(row.docente_id)) globalLatest.set(row.docente_id, row);
    if (row.submitted_by === actorId && !ownLatest.has(row.docente_id)) {
      ownLatest.set(row.docente_id, row);
      completedTeacherIds.add(row.docente_id);
      ownLatestScores.set(row.docente_id, row.normalized_score);
    }
  }
  for (const [teacherId, own] of ownLatest) {
    if (globalLatest.get(teacherId) !== own) supersededTeacherIds.add(teacherId);
  }
  for (const row of legacy) {
    if (row.evaluador_id !== actorId) continue;
    completedTeacherIds.add(row.docente_id);
    if (!ownLatestScores.has(row.docente_id)) ownLatestScores.set(row.docente_id, row.score_normalizado);
  }
  return { completedTeacherIds, ownLatestScores, supersededTeacherIds };
}

export function buildObservationPortfolio(
  teachers: PortfolioTeacher[],
  completedObservationTeacherIds: Set<number>,
  observationScores: Map<number, number | null> = new Map(),
): ObservationPortfolioRow[] {
  return teachers.map((teacher) => ({
    teacher,
    observationCompleted: completedObservationTeacherIds.has(teacher.id),
    observationScore: observationScores.get(teacher.id) ?? null,
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
    coordination: withCycle(
      "/coordinador/captura/coordinacion",
      cycleId,
      teacherId,
    ),
    planning: withCycle("/coordinador/planeaciones", cycleId, teacherId),
    results: withCycle("/coordinador/reportes", cycleId, teacherId),
  };
}

export function observationPortfolioLinks(cycleId: number, teacherId: number) {
  return {
    observation: withCycle(
      "/coordinador/captura/observacion",
      cycleId,
      teacherId,
    ),
  };
}
