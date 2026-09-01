import { describe, expect, it } from "vitest";
import {
  buildCoordinatedPortfolio,
  buildObservationPortfolio,
  coordinatedPortfolioLinks,
  observationPortfolioLinks,
} from "./coordinatorDashboardPortfolio";

const coordinatedTeacher = { id: 1, nombre: "Ana", apellidos: "Coordinada", modalidad: "Escolarizado" };
const observationTeacher = { id: 2, nombre: "Beto", apellidos: "Observado", modalidad: "Virtual" };
const sharedTeacher = { id: 3, nombre: "Carla", apellidos: "Ambos", modalidad: null };

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
    expect(buildCoordinatedPortfolio([], new Set(), [], new Set())).toEqual([]);
    expect(buildObservationPortfolio([], new Set())).toEqual([]);
  });

  it("exposes actions only for their portfolio purpose", () => {
    expect(coordinatedPortfolioLinks(12, 1)).toEqual({
      coordination: "/coordinador/captura/coordinacion?cuatrimestre=12&docente_id=1",
      planning: "/coordinador/planeaciones?cuatrimestre=12&docente_id=1",
      results: "/coordinador/reportes?cuatrimestre=12&docente_id=1",
    });
    expect(observationPortfolioLinks(12, 2)).toEqual({
      observation: "/coordinador/captura/observacion?cuatrimestre=12&docente_id=2",
    });
  });
});
