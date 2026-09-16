import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  groupPlanningAssignmentsBySubjectName,
  hasStandaloneGroupNumericToken,
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

    expect(normalizePlanningSubjectName(" Álgebra  Básica ")).toBe(
      "algebra basica",
    );
    expect(scopes).toHaveLength(2);
    expect(scopes[0]).toMatchObject({
      key: "algebra basica",
      canonical: { asignaturaId: 4, grupo: "3A" },
      grupos: ["3A", "3B"],
    });
  });

  it("resolves NP by normalized subject scope while retaining approved planning", () => {
    const [scope] = groupPlanningAssignmentsBySubjectName([
      { asignaturaId: 4, asignaturaNombre: "Ética Profesional", grupo: "1A" },
    ]);
    expect(
      getPlanningSubjectStatus(
        scope,
        [],
        [{ subject_key: "etica profesional", estado: "NP" }],
      ),
    ).toBe("np");
    expect(
      getPlanningSubjectStatus(
        scope,
        [{ asignaturaNombre: "ÉTICA PROFESIONAL", estado: "Aprobado" }],
        [{ subject_key: "etica profesional", estado: "NP" }],
      ),
    ).toBe("approved");
  });

  it("uses group NP only when every active assignment in a normalized subject is NP", () => {
    const [scope] = groupPlanningAssignmentsBySubjectName([
      {
        grupoId: 40,
        asignaturaId: 4,
        asignaturaNombre: "Ética Profesional",
        grupo: "1A",
      },
      {
        grupoId: 41,
        asignaturaId: 4,
        asignaturaNombre: "ÉTICA PROFESIONAL",
        grupo: "1B",
      },
    ]);

    const allGroupsNp = [
      { grupo_id: 40, estado: "NP" },
      { grupo_id: 41, estado: "NP" },
    ];
    expect(getPlanningSubjectStatus(scope, [], [], allGroupsNp)).toBe("np");
    expect(
      getPlanningSubjectStatus(
        scope,
        [{ asignaturaNombre: "Ética Profesional", estado: "Aprobado" }],
        [],
        allGroupsNp,
      ),
    ).toBe("np");
    expect(
      getPlanningSubjectStatus(scope, [], [], [{ grupo_id: 40, estado: "NP" }]),
    ).toBe("pending");
  });

  it("matches configured group filter tokens only as standalone numeric tokens", () => {
    expect(
      hasStandaloneGroupNumericToken("27-1 EECI 23 01A - Sabatino", 23),
    ).toBe(true);
    expect(
      hasStandaloneGroupNumericToken("27-1 MADH 24 04A - Sabatino", 24),
    ).toBe(true);
    expect(
      hasStandaloneGroupNumericToken("27-1 CONPUB 53 04A - Sabatino", 53),
    ).toBe(true);
    expect(
      hasStandaloneGroupNumericToken("27-1 PED 11 04B - Matutino", 11),
    ).toBe(true);
    expect(
      hasStandaloneGroupNumericToken("27-1 DE 12 04A - Vespertino", 12),
    ).toBe(true);
    expect(hasStandaloneGroupNumericToken("27-1 EECI 123 01A", 23)).toBe(false);
    expect(hasStandaloneGroupNumericToken("27-1 EECI 231 01A", 23)).toBe(false);
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
    new URL(
      "../../supabase/migrations/063_planning_subject_scope.sql",
      import.meta.url,
    ),
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
    new URL(
      "../../supabase/migrations/065_planning_subject_np.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const npBulkMigration = readFileSync(
    new URL(
      "../../supabase/migrations/066_planning_subject_np_bulk.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const groupNpMigration = readFileSync(
    new URL(
      "../../supabase/migrations/075_planning_group_np.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const npAdminPage = readFileSync(
    new URL(
      "../pages/admin/planeaciones/no-presentadas.astro",
      import.meta.url,
    ),
    "utf8",
  );
  const adminPage = readFileSync(
    new URL("../pages/admin/docentes/[id].astro", import.meta.url),
    "utf8",
  );

  it("adds and backfills the covered groups column", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS grupos_cubiertos TEXT[]",
    );
    expect(migration).toContain("SET grupos_cubiertos = ARRAY[grupo]");
  });

  it("persists server-resolved coverage and rejects duplicate same-name records", () => {
    expect(uploadApi).toContain("normalizePlanningSubjectName");
    expect(uploadApi).toContain("grupos_cubiertos");
    expect(uploadApi).toContain("conflict");
  });

  it("uses authenticated, canonical batch persistence and blocks NP uploads server-side", () => {
    expect(statusApi).toContain('requireRole(cookies, ["superadmin"])');
    expect(statusApi).toContain("set_planning_subject_np_bulk");
    expect(statusApi).toContain("MAX_BATCH_SIZE");
    expect(statusApi).toContain("planning_status_duplicate_items");
    expect(statusApi).toContain(
      "Subject display names from the browser are deliberately ignored",
    );
    expect(statusApi).toContain("recalcularCalificacionDocente");
    expect(statusApi).toContain("planning_status_recalculation_failed");
    expect(uploadApi).toContain("planning_subject_marked_np");
    expect(npMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(npMigration).toContain("approved planning cannot be marked NP");
    expect(npBulkMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.set_planning_subject_np_bulk",
    );
    expect(npBulkMigration).toContain("jsonb_array_length(p_items) > 50");
    expect(npBulkMigration).toContain("duplicate or invalid NP batch scope");
    expect(npBulkMigration).toContain("public.set_planning_subject_np(");
  });

  it("uses group-scoped NP without changing planning records", () => {
    expect(groupNpMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.planning_group_np",
    );
    expect(groupNpMigration).toContain("UNIQUE (grupo_id)");
    expect(groupNpMigration).toContain("estado IN ('NP', 'Activa')");
    expect(groupNpMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.set_planning_group_np_bulk",
    );
    expect(groupNpMigration).toContain("g.modalidad = 'Escolarizado'");
    expect(groupNpMigration).toContain("FOR UPDATE");
    expect(groupNpMigration).not.toContain("UPDATE public.planeaciones");
    const groupHandler = statusApi.slice(
      statusApi.indexOf("async function setGroupNpStatus"),
      statusApi.indexOf("export const POST"),
    );
    expect(statusApi).toContain("const MAX_BATCH_SIZE = 50");
    expect(statusApi).toContain("const MAX_GROUP_NP_BATCH_SIZE = 1000");
    expect(groupHandler).toContain(
      "requestedItems.length > MAX_GROUP_NP_BATCH_SIZE",
    );
    expect(groupHandler).not.toContain(
      "requestedItems.length > MAX_BATCH_SIZE",
    );
    expect(groupHandler).toContain(
      "p_items: items.map((item) => ({ grupo_id: item.grupoId }))",
    );
    expect(groupNpMigration).toContain("jsonb_array_length(p_items) > 1000");
    expect(statusApi).toContain("mark_group_np");
    expect(statusApi).toContain("set_planning_group_np_bulk");
    expect(uploadApi).toContain("planning_group_marked_np");
  });

  it("limits NP scopes and persistence validation to Escolarizado assignments", () => {
    expect(npAdminPage).toContain(".eq('modalidad', 'Escolarizado')");
    expect(statusApi).toContain('.eq("modalidad", "Escolarizado")');
    expect(npMigration).toContain("g.modalidad = 'Escolarizado'");
  });

  it("uses group-level eligibility and safely guards teacher planning rendering", () => {
    expect(teacherPage).toContain(
      "const gruposEscolarizados = gruposDocente.filter((group) => group.modalidad === 'Escolarizado');",
    );
    expect(teacherPage).toContain(
      "const gruposDocenteElegibles = gruposEscolarizados.filter((group) => !npGroupIds.has(group.id));",
    );
    expect(teacherPage).not.toContain("docentes.modalidad");
    expect(teacherPage).not.toContain("docente.modalidad");
    expect(teacherPage).toContain("async function safeQuery(");
    expect(teacherPage).toContain(
      "const canShowUpload = canDetermineUploadScope",
    );
    expect(teacherPage).toContain(
      "const canShowPlanningList = planningDataContextAvailable && !planeacionesResult?.error;",
    );
    expect(teacherPage).toContain("{planningSubmissionOpen && <div");
    expect(teacherPage).toContain("{canShowPlanningList && <div");
  });

  it("retains subject and group NP notices for teacher planning scopes", () => {
    expect(teacherPage).toContain("const materiasNP = canDetermineUploadScope");
    expect(teacherPage).toContain(
      "getPlanningSubjectStatus(scope, planningSubjectRecords, npSubjectRecords) === 'np'",
    );
    expect(teacherPage).toContain(
      "Asignaturas marcadas como no presentadas (NP)",
    );
    expect(teacherPage).toContain("Grupos marcados como no presentados (NP)");
    expect(teacherPage).toContain(
      "Estos grupos se excluyeron administrativamente y no están disponibles para cargar una planeación.",
    );
  });

  it("renders grouped teacher uploads and the admin subject performance table", () => {
    expect(teacherPage).toContain("groupPlanningAssignmentsBySubjectName");
    expect(teacherPage).toContain("grupos_cubiertos");
    expect(adminPage).toContain("Desempeño por asignatura");
    expect(adminPage).toContain("subjectPerformanceRows");
  });

  it("provides accessible search, homogeneous multi-select, and an adjacent selection panel", () => {
    expect(npAdminPage).toContain('id="np-search"');
    expect(npAdminPage).toContain("data-search=");
    expect(npAdminPage).toContain(".np-select");
    expect(npAdminPage).toContain('id="np-selected-items"');
    expect(npAdminPage).toContain('id="np-clear-selection"');
    expect(npAdminPage).toContain("No se pueden mezclar ambas acciones");
    expect(npAdminPage).toContain("row.status === 'approved' ? <span");
    expect(npAdminPage).toContain("items: Array.from(selected.values())");
    expect(npAdminPage).toContain('id="group-np-filter"');
    expect(npAdminPage).toContain("data-group-tokens=");
    expect(npAdminPage).toContain('id="group-np-select-visible"');
    expect(npAdminPage).toContain("Marcar grupos seleccionados como NP");
    expect(npAdminPage).toContain("GROUP_NP_FILTER_TOKENS");
  });
});
