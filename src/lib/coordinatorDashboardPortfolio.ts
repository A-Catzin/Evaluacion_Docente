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
  /** Normalized score of the versioned coordination submission; null when legacy-only or invalid. */
  coordinationScore: number | null;
  planningSubmitted: number;
  planningPending: number;
  planningReviewed: number;
  resultsAvailable: boolean;
};

export type OtherAccountObservation = { score: number | null; by: string };

export type ObservationPortfolioRow = {
  teacher: PortfolioTeacher;
  observationCompleted: boolean;
  observationScore: number | null;
  /** True when someone else registered the observation and the actor has none of their own. */
  observationRegisteredByOther: boolean;
  observationOtherScore: number | null;
  observationOtherBy: string | null;
};

export function buildCoordinatedPortfolio(
  teachers: PortfolioTeacher[],
  completedCoordinationTeacherIds: Set<number>,
  planningRecords: PlanningRecord[],
  teacherIdsWithResults: Set<number>,
  versionedCoordination: Map<number, number | null> = new Map(),
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
      coordinationCompleted:
        completedCoordinationTeacherIds.has(teacher.id) ||
        versionedCoordination.has(teacher.id),
      coordinationScore: versionedCoordination.get(teacher.id) ?? null,
      planningSubmitted: plans.length,
      planningPending,
      planningReviewed: plans.length - planningPending,
      resultsAvailable: teacherIdsWithResults.has(teacher.id),
    };
  });
}

type VersionedCoordination = {
  docente_id: number;
  normalized_score: number | string | null;
  validity_status: string | null;
};

/** Latest versioned coordination per teacher (one capture per teacher, whoever submitted it). */
export function summarizeVersionedCoordination(
  rows: VersionedCoordination[],
): Map<number, number | null> {
  const byTeacher = new Map<number, number | null>();
  for (const row of rows) {
    if (byTeacher.has(row.docente_id)) continue;
    const score = Number(row.normalized_score);
    byTeacher.set(
      row.docente_id,
      row.validity_status === "valid" && Number.isFinite(score) ? score : null,
    );
  }
  return byTeacher;
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
  const registeredByOthers = new Map<number, OtherAccountObservation>();
  if (!actorId) return { completedTeacherIds, ownLatestScores, supersededTeacherIds, registeredByOthers };

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
  // The actor's own work stays separate: an observation by someone else is reported, never attributed to the actor.
  for (const [teacherId, latest] of globalLatest) {
    if (completedTeacherIds.has(teacherId)) continue;
    registeredByOthers.set(teacherId, { score: latest.normalized_score, by: latest.submitted_by ?? "" });
  }
  return { completedTeacherIds, ownLatestScores, supersededTeacherIds, registeredByOthers };
}

export function buildObservationPortfolio(
  teachers: PortfolioTeacher[],
  completedObservationTeacherIds: Set<number>,
  observationScores: Map<number, number | null> = new Map(),
  registeredByOthers: Map<number, OtherAccountObservation> = new Map(),
): ObservationPortfolioRow[] {
  return teachers.map((teacher) => {
    const completed = completedObservationTeacherIds.has(teacher.id);
    const other = completed ? undefined : registeredByOthers.get(teacher.id);
    return {
      teacher,
      observationCompleted: completed,
      observationScore: observationScores.get(teacher.id) ?? null,
      observationRegisteredByOther: Boolean(other),
      observationOtherScore: other?.score ?? null,
      observationOtherBy: other?.by ?? null,
    };
  });
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
