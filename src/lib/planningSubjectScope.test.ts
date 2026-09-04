import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  groupPlanningAssignmentsBySubjectName,
  isPlanningSubjectBlocked,
  normalizePlanningSubjectName,
} from "./planningSubjectScope";
import { getPlanningSubjectStatus } from "./planningSubjectStatus";

describe("planning subject scope", () => {
  it("normalizes subject names and covers every matching group with one canonical assignment", () => {
    const scopes = groupPlanningAssignmentsBySubjectName([
      { asignaturaId: 9, asignaturaNombre: " Álgebra  Básica ", grupo: "3B" },
      { asignaturaId: 4, asignaturaNombre: "ALGEBRA BÁSICA", grupo: "3A" },
      { asignaturaId: 5, asignaturaNombre: "Física", grupo: "3A" },
    ]);

    expect(normalizePlanningSubjectName(" Álgebra  Básica ")).toBe("algebra basica");
    expect(scopes).toHaveLength(2);
    expect(scopes[0]).toMatchObject({
      key: "algebra basica",
      canonical: { asignaturaId: 4, grupo: "3A" },
      grupos: ["3A", "3B"],
    });
  });

  it("resolves NP by normalized subject scope while retaining approved planning", () => {
    const [scope] = groupPlanningAssignmentsBySubjectName([{ asignaturaId: 4, asignaturaNombre: "Ética Profesional", grupo: "1A" }]);
    expect(getPlanningSubjectStatus(scope, [], [{ subject_key: "etica profesional", estado: "NP" }])).toBe("np");
    expect(getPlanningSubjectStatus(scope, [{ asignaturaNombre: "ÉTICA PROFESIONAL", estado: "Aprobado" }], [{ subject_key: "etica profesional", estado: "NP" }])).toBe("approved");
  });

  it("blocks a second upload across different catalog IDs with the same normalized name", () => {
    expect(
      isPlanningSubjectBlocked(
        [
          { asignaturaNombre: "Comunicación", estado: "Pendiente" },
          { asignaturaNombre: "Matemáticas", estado: "Corrección" },
        ],
        " comunicación ",
      ),
    ).toBe(true);
    expect(
      isPlanningSubjectBlocked(
        [{ asignaturaNombre: "Matemáticas", estado: "Corrección" }],
        "MATEMATICAS",
      ),
    ).toBe(false);
  });
});

describe("planning subject scope source contracts", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/063_planning_subject_scope.sql", import.meta.url),
    "utf8",
  );
  const uploadApi = readFileSync(
    new URL("../pages/api/docente/subir-archivo.ts", import.meta.url),
    "utf8",
  );
  const teacherPage = readFileSync(
    new URL("../pages/docente/planeaciones.astro", import.meta.url),
    "utf8",
  );
  const statusApi = readFileSync(
    new URL("../pages/api/admin/planeacion-status.ts", import.meta.url),
    "utf8",
  );
  const npMigration = readFileSync(
    new URL("../../supabase/migrations/065_planning_subject_np.sql", import.meta.url),
    "utf8",
  );
  const npAdminPage = readFileSync(
    new URL("../pages/admin/planeaciones/no-presentadas.astro", import.meta.url),
    "utf8",
  );
  const adminPage = readFileSync(
    new URL("../pages/admin/docentes/[id].astro", import.meta.url),
    "utf8",
  );

  it("adds and backfills the covered groups column", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS grupos_cubiertos TEXT[]");
    expect(migration).toContain("SET grupos_cubiertos = ARRAY[grupo]");
  });

  it("persists server-resolved coverage and rejects duplicate same-name records", () => {
    expect(uploadApi).toContain("normalizePlanningSubjectName");
    expect(uploadApi).toContain("grupos_cubiertos");
    expect(uploadApi).toContain("conflict");
  });

  it("uses an authenticated admin RPC and blocks NP uploads server-side", () => {
    expect(statusApi).toContain('requireRole(cookies, ["superadmin"])');
    expect(statusApi).toContain("set_planning_subject_np");
    expect(statusApi).toContain("recalcularCalificacionDocente");
    expect(statusApi).toContain("planning_status_recalculation_failed");
    expect(uploadApi).toContain("planning_subject_marked_np");
    expect(npMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(npMigration).toContain("approved planning cannot be marked NP");
  });

  it("limits NP scopes and persistence validation to Escolarizado assignments", () => {
    expect(npAdminPage).toContain(".eq('modalidad', 'Escolarizado')");
    expect(statusApi).toContain('.eq("modalidad", "Escolarizado")');
    expect(npMigration).toContain("g.modalidad = 'Escolarizado'");
  });

  it("renders grouped teacher uploads and the admin subject performance table", () => {
    expect(teacherPage).toContain("groupPlanningAssignmentsBySubjectName");
    expect(teacherPage).toContain("grupos_cubiertos");
    expect(adminPage).toContain("Desempeño por asignatura");
    expect(adminPage).toContain("subjectPerformanceRows");
  });
});
