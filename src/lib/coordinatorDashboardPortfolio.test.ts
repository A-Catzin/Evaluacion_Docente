import { describe, expect, it } from "vitest";
import {
  buildCoordinatedPortfolio,
  buildObservationPortfolio,
  coordinatedPortfolioLinks,
  observationPortfolioLinks,
  summarizeObserverObservations,
  summarizeVersionedCoordination,
} from "./coordinatorDashboardPortfolio";

const coordinatedTeacher = {
  id: 1,
  nombre: "Ana",
  apellidos: "Coordinada",
  modalidad: "Escolarizado",
};
const observationTeacher = {
  id: 2,
  nombre: "Beto",
  apellidos: "Observado",
  modalidad: "Virtual",
};
const sharedTeacher = {
  id: 3,
  nombre: "Carla",
  apellidos: "Ambos",
  modalidad: null,
};

describe("coordinator dashboard portfolios", () => {
  it("keeps coordination and observation portfolios independent, including empty portfolios", () => {
    const coordinated = buildCoordinatedPortfolio(
      [coordinatedTeacher, sharedTeacher],
      new Set([1]),
      [
        { docenteId: 1, estado: "Pendiente" },
        { docenteId: 1, estado: "Aprobado" },
      ],
      new Set([1]),
    );
    const observation = buildObservationPortfolio(
      [observationTeacher, sharedTeacher],
      new Set([2]),
      new Map([[2, 91.92]]),
    );

    expect(coordinated.map((row) => row.teacher.id)).toEqual([1, 3]);
    expect(observation.map((row) => row.teacher.id)).toEqual([2, 3]);
    expect(coordinated[0]).toMatchObject({
      coordinationCompleted: true,
      planningSubmitted: 2,
      planningPending: 1,
      planningReviewed: 1,
      resultsAvailable: true,
    });
    expect(observation[0]).toMatchObject({
      observationCompleted: true,
      observationScore: 91.92,
    });
    expect(observation[1]).toMatchObject({
      observationCompleted: false,
      observationScore: null,
    });
    expect(buildCoordinatedPortfolio([], new Set(), [], new Set())).toEqual([]);
    expect(buildObservationPortfolio([], new Set())).toEqual([]);
  });

  it("keeps an observer's original score and completion after a later institutional revision", () => {
    const summary = summarizeObserverObservations(
      [
        { id: 10, docente_id: 271, submitted_by: "roxana", submitted_at: "2025-10-07T12:00:00Z", normalized_score: 59.60, validity_status: "valid" },
        { id: 11, docente_id: 271, submitted_by: "calidad", submitted_at: "2025-10-12T12:00:00Z", normalized_score: 96.97, validity_status: "valid" },
      ],
      [],
      "roxana",
    );

    expect(summary.completedTeacherIds).toEqual(new Set([271]));
    expect(summary.ownLatestScores).toEqual(new Map([[271, 59.60]]));
    expect(summary.supersededTeacherIds).toEqual(new Set([271]));
  });

  it("does not attribute another observer's submission or legacy observation to the current actor", () => {
    const summary = summarizeObserverObservations(
      [{ id: 12, docente_id: 271, submitted_by: "calidad", submitted_at: "2025-10-12T12:00:00Z", normalized_score: 96.97, validity_status: "valid" }],
      [{ docente_id: 272, evaluador_id: "calidad", score_normalizado: 85 }],
      "roxana",
    );

    expect(summary.completedTeacherIds).toEqual(new Set());
    expect(summary.ownLatestScores).toEqual(new Map());
    expect(summary.supersededTeacherIds).toEqual(new Set());
  });

  it("marks an invalid latest own submission complete without replacing its null score with zero", () => {
    const summary = summarizeObserverObservations(
      [
        { id: 13, docente_id: 271, submitted_by: "roxana", submitted_at: "2025-10-07T12:00:00Z", normalized_score: 59.60, validity_status: "valid" },
        { id: 14, docente_id: 271, submitted_by: "roxana", submitted_at: "2025-10-08T12:00:00Z", normalized_score: null, validity_status: "invalid_excessive_na" },
      ],
      [],
      "roxana",
    );

    expect(summary.completedTeacherIds).toEqual(new Set([271]));
    expect(summary.ownLatestScores.get(271)).toBeNull();
    expect(summary.supersededTeacherIds).toEqual(new Set());
  });

  it("attributes only own legacy entries and does not flag a current own version as superseded", () => {
    const summary = summarizeObserverObservations(
      [{ id: 16, docente_id: 273, submitted_by: "roxana", submitted_at: "2025-10-12T12:00:00Z", normalized_score: 92, validity_status: "valid" },
        { id: 15, docente_id: 273, submitted_by: "calidad", submitted_at: "2025-10-07T12:00:00Z", normalized_score: 91, validity_status: "valid" }],
      [{ docente_id: 274, evaluador_id: "roxana", score_normalizado: 79 },
        { docente_id: 275, evaluador_id: "calidad", score_normalizado: 88 }],
      "roxana",
    );

    expect(summary.completedTeacherIds).toEqual(new Set([273, 274]));
    expect(summary.ownLatestScores).toEqual(new Map([[273, 92], [274, 79]]));
    expect(summary.supersededTeacherIds).toEqual(new Set());
  });

  it("reports the latest observation registered by another account when the actor has none", () => {
    const summary = summarizeObserverObservations(
      [
        { id: 20, docente_id: 15, submitted_by: "proyectos", submitted_at: "2026-10-12T18:00:00Z", normalized_score: 80, validity_status: "valid" },
        { id: 21, docente_id: 15, submitted_by: "calidad", submitted_at: "2026-10-13T18:00:00Z", normalized_score: 90, validity_status: "valid" },
      ],
      [],
      "cristhian",
    );

    expect(summary.completedTeacherIds).toEqual(new Set());
    expect(summary.registeredByOthers).toEqual(new Map([[15, { score: 90, by: "calidad" }]]));
  });

  it("does not report another account's observation when the actor has registered their own", () => {
    const summary = summarizeObserverObservations(
      [
        { id: 22, docente_id: 15, submitted_by: "cristhian", submitted_at: "2026-10-12T18:00:00Z", normalized_score: 70, validity_status: "valid" },
        { id: 23, docente_id: 15, submitted_by: "proyectos", submitted_at: "2026-10-13T18:00:00Z", normalized_score: 80, validity_status: "valid" },
      ],
      [],
      "cristhian",
    );

    expect(summary.completedTeacherIds).toEqual(new Set([15]));
    expect(summary.registeredByOthers).toEqual(new Map());
  });

  it("keeps a null score for an invalid submission registered by another account", () => {
    const summary = summarizeObserverObservations(
      [{ id: 24, docente_id: 16, submitted_by: "proyectos", submitted_at: "2026-10-12T18:00:00Z", normalized_score: null, validity_status: "invalid_excessive_na" }],
      [],
      "cristhian",
    );

    expect(summary.registeredByOthers).toEqual(new Map([[16, { score: null, by: "proyectos" }]]));
  });

  it("marks a teacher registered by another account in the observation portfolio, without counting it as the actor's own", () => {
    const rows = buildObservationPortfolio(
      [observationTeacher, sharedTeacher],
      new Set([sharedTeacher.id]),
      new Map([[sharedTeacher.id, 70]]),
      new Map([[observationTeacher.id, { score: 80, by: "proyectos" }]]),
    );

    expect(rows[0]).toMatchObject({ observationCompleted: false, observationRegisteredByOther: true, observationOtherScore: 80, observationOtherBy: "proyectos" });
    expect(rows[1]).toMatchObject({ observationCompleted: true, observationRegisteredByOther: false, observationOtherScore: null, observationOtherBy: null });
  });

  it("exposes actions only for their portfolio purpose", () => {
    expect(coordinatedPortfolioLinks(12, 1)).toEqual({
      coordination:
        "/coordinador/captura/coordinacion?cuatrimestre=12&docente_id=1",
      planning: "/coordinador/planeaciones?cuatrimestre=12&docente_id=1",
      results: "/coordinador/reportes?cuatrimestre=12&docente_id=1",
    });
    expect(observationPortfolioLinks(12, 2)).toEqual({
      observation:
        "/coordinador/captura/observacion?cuatrimestre=12&docente_id=2",
    });
  });
});

describe("versioned coordination in the coordinated portfolio", () => {
  const teacher = { id: 336, nombre: "A", apellidos: "B", modalidad: null };

  it("counts a versioned coordination as registered with its score", () => {
    const versioned = summarizeVersionedCoordination([
      { docente_id: 336, normalized_score: "98.33", validity_status: "valid" },
    ]);
    const [row] = buildCoordinatedPortfolio([teacher], new Set(), [], new Set(), versioned);
    expect(row.coordinationCompleted).toBe(true);
    expect(row.coordinationScore).toBe(98.33);
  });

  it("keeps it registered without score when invalid, and pending when absent", () => {
    const invalid = summarizeVersionedCoordination([
      { docente_id: 336, normalized_score: null, validity_status: "invalid_excessive_na" },
    ]);
    expect(buildCoordinatedPortfolio([teacher], new Set(), [], new Set(), invalid)[0]).toMatchObject({ coordinationCompleted: true, coordinationScore: null });
    expect(buildCoordinatedPortfolio([teacher], new Set(), [], new Set())[0]).toMatchObject({ coordinationCompleted: false, coordinationScore: null });
  });

  it("still honors the legacy coordination table", () => {
    expect(buildCoordinatedPortfolio([teacher], new Set([336]), [], new Set())[0].coordinationCompleted).toBe(true);
  });
});
