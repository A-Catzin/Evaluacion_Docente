import { describe, expect, it } from "vitest";
import {
  filterTeacherResponsibilityRows,
  mapTeacherResponsibilityCompletionRows,
  paginateTeacherResponsibilityRows,
} from "./teacherResponsibilityCompletion";

const rows = mapTeacherResponsibilityCompletionRows([
  {
    docente_id: 7,
    docente_nombre: "Ana",
    docente_apellidos: "López",
    docente_email: "ana@tecplayacar.edu.mx",
    coordinators: ["María Coordinadora", "admin@tecplayacar.edu.mx"],
    autodiagnostico_completed: true,
    autodiagnostico_completed_at: "2025-01-10T12:00:00Z",
    planning_status: "complete",
    planning_subject_count: 2,
    planning_submitted_count: 2,
    planning_np_subject_count: 0,
    planning_np_group_count: 0,
    planning_group_count: 2,
    planning_last_submitted_at: "2025-01-11T12:00:00Z",
    planning_plan_id: 99,
  },
  {
    docente_id: 8,
    docente_nombre: "Beto",
    docente_apellidos: "Ruiz",
    docente_email: "beto@tecplayacar.edu.mx",
    coordinators: [],
    autodiagnostico_completed: true,
    autodiagnostico_completed_at: "2025-01-12T12:00:00Z",
    planning_status: "partial",
    planning_subject_count: 3,
    planning_submitted_count: 1,
    planning_np_subject_count: 1,
    planning_np_group_count: 2,
    planning_group_count: 5,
    planning_last_submitted_at: "2025-01-13T12:00:00Z",
    planning_plan_id: 100,
  },
  {
    docente_id: 9,
    docente_nombre: "Carla",
    docente_apellidos: "Núñez",
    docente_email: "carla@tecplayacar.edu.mx",
    coordinators: [],
    autodiagnostico_completed: false,
    autodiagnostico_completed_at: null,
    planning_status: "np",
    planning_subject_count: 0,
    planning_submitted_count: 0,
    planning_np_subject_count: 0,
    planning_np_group_count: 1,
    planning_group_count: 1,
    planning_last_submitted_at: null,
    planning_plan_id: null,
  },
  {
    docente_id: 10,
    docente_nombre: "Diana",
    docente_apellidos: "Mora",
    docente_email: "diana@tecplayacar.edu.mx",
    coordinators: [],
    autodiagnostico_completed: true,
    autodiagnostico_completed_at: "2025-01-14T12:00:00Z",
    planning_status: "not_applicable",
    planning_subject_count: 0,
    planning_submitted_count: 0,
    planning_np_subject_count: 0,
    planning_np_group_count: 0,
    planning_group_count: 0,
    planning_last_submitted_at: null,
    planning_plan_id: null,
  },
  {
    docente_id: 11,
    docente_nombre: "Elena",
    docente_apellidos: "Sosa",
    docente_email: "elena@tecplayacar.edu.mx",
    coordinators: ["Otro Coordinador"],
    autodiagnostico_completed: true,
    autodiagnostico_completed_at: "2025-01-15T12:00:00Z",
    planning_status: "np",
    planning_subject_count: 0,
    planning_submitted_count: 0,
    planning_np_subject_count: 2,
    planning_np_group_count: 2,
    planning_group_count: 2,
    planning_last_submitted_at: null,
    planning_plan_id: null,
  },
]);

describe("teacher responsibility completion", () => {
  it("keeps planning delivery separate from NP and derives global completion", () => {
    expect(rows.map((row) => [row.planningStatus, row.globalStatus])).toEqual([
      ["complete", "both"],
      ["partial", "one"],
      ["np", "one"],
      ["not_applicable", "one"],
      ["np", "both"],
    ]);
    expect(rows[1]).toMatchObject({
      planningSubmittedCount: 1,
      planningNpSubjectCount: 1,
      planningNpGroupCount: 2,
    });
  });

  it("recognizes NP-only subjects and groups without treating them as delivered", () => {
    expect(rows[2]).toMatchObject({
      planningStatus: "np",
      planningSubjectCount: 0,
      planningNpGroupCount: 1,
      planningGroupCount: 1,
      globalStatus: "one",
    });
    expect(rows[4]).toMatchObject({
      planningStatus: "np",
      planningSubjectCount: 0,
      planningSubmittedCount: 0,
      planningNpSubjectCount: 2,
      globalStatus: "both",
    });
    expect(rows[3].planningStatus).toBe("not_applicable");
  });

  it("filters independently by normalized text, responsibility states, and global state", () => {
    expect(filterTeacherResponsibilityRows(rows, { query: "D-07" })).toEqual([]);
    expect(rows[0].coordinators).toEqual(["María Coordinadora", "admin@tecplayacar.edu.mx"]);
    expect(filterTeacherResponsibilityRows(rows, { query: "NUNEZ" })).toEqual([rows[2]]);
    expect(filterTeacherResponsibilityRows(rows, { planning: "partial" })).toEqual([rows[1]]);
    expect(filterTeacherResponsibilityRows(rows, { planning: "np" })).toEqual([rows[2], rows[4]]);
    expect(filterTeacherResponsibilityRows(rows, { autodiagnostico: "complete", global: "one" })).toEqual([rows[1], rows[3]]);
  });

  it("paginates filtered rows without losing the total", () => {
    const page = paginateTeacherResponsibilityRows(rows, 2, 2);
    expect(page).toMatchObject({ total: 5, totalPages: 3, currentPage: 2, rows: [rows[2], rows[3]] });
  });
});
