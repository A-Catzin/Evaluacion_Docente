import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planAssignmentImportSync } from "./assignmentImportSync";

const teacher = { id: 7, nombre: "Ana", apellidos: "López", activo: true };
const base = {
  id: 11,
  cuatrimestre_id: 4,
  clave: "A 1",
  plan_normalizado: "PLAN A",
  grado: "1",
  grupo_normalizado: "A 1",
  asignatura_id: null,
  docente_id: null,
  num_alumnos: 20,
};
const row = {
  row: 2,
  plan: "Plan A",
  group: "A 1",
  groupId: "",
  subjectKey: "MAT-01",
  subjectName: "Matemáticas",
  teacher: "ANA LOPEZ",
  teacherEmail: "",
  teacherEmployee: "",
};
function plan(overrides: Record<string, unknown> = {}) {
  return planAssignmentImportSync({
    cycleId: 4,
    rows: [row],
    teachers: [teacher],
    subjects: [{ id: 8, clave: "MAT-01" }],
    groups: [base],
    openIssues: [],
    ...overrides,
  });
}

describe("assignment import sync planning", () => {
  it("is a pure preview and proposes creation without mutating its inputs", () => {
    const groups = [base];
    const result = plan({ groups });
    expect(result.actions).toMatchObject([
      { kind: "create", baseIds: [11], teacherId: 7 },
    ]);
    expect(groups).toEqual([base]);
  });

  it("falls back to canonical identity when an external group ID is not a database ID", () => {
    const result = plan({ rows: [{ ...row, groupId: "117012" }] });

    expect(result.actions).toMatchObject([
      { kind: "create", baseIds: [11], teacherId: 7 },
    ]);
    expect(result.blockers).not.toContainEqual(
      expect.objectContaining({ reason: "grupo_id_no_validado" }),
    );
  });

  it("falls back from a conflicting database group ID to the canonical base", () => {
    const result = plan({
      rows: [{ ...row, groupId: "12" }],
      groups: [
        base,
        {
          ...base,
          id: 12,
          clave: "B 1",
          plan_normalizado: "PLAN B",
          grupo_normalizado: "B 1",
        },
      ],
    });

    expect(result.actions).toMatchObject([{ kind: "create", baseIds: [11] }]);
    expect(result.blockers).toEqual([]);
  });

  it("falls back from a subject-row ID while keeping the CSV teacher authoritative", () => {
    const result = plan({
      rows: [{ ...row, groupId: "21" }],
      groups: [
        { ...base },
        {
          ...base,
          id: 21,
          asignatura_id: 8,
          docente_id: 3,
          importacion_key: "4|PLAN A|1|A 1|MAT-01",
        },
      ],
    });
    expect(result.actions).toMatchObject([
      {
        kind: "update",
        existingGroupId: 21,
        previousTeacherId: 3,
        teacherId: 7,
      },
    ]);
  });

  it("blocks missing subjects and unsafe duplicate assignment groups", () => {
    expect(plan({ subjects: [] }).blockers[0]?.reason).toBe(
      "asignatura_no_encontrada",
    );
    expect(
      plan({
        groups: [
          { ...base },
          { ...base, id: 21, asignatura_id: 8 },
          { ...base, id: 22, asignatura_id: 8 },
        ],
      }).blockers[0]?.reason,
    ).toBe("asignacion_duplicada");
  });

  it("blocks genuinely ambiguous canonical plan/group bases despite an external group ID", () => {
    const result = plan({
      rows: [{ ...row, groupId: "117012" }],
      groups: [base, { ...base, id: 12, grado: "2" }],
    });

    expect(result.actions).toEqual([]);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ reason: "grupo_base_ambiguo" }),
    );
  });

  it("uses equivalent base duplicates as an enrollment union and counts historical open issues", () => {
    const result = plan({
      groups: [base, { ...base, id: 12 }],
      openIssues: [
        { id: 99, plan: "Plan A", grupo: "A_1", clave_asignatura: "MAT-01" },
      ],
    });
    expect(result.actions[0]).toMatchObject({
      baseIds: [11, 12],
      issueCount: 1,
    });
    expect(result.summary.issuesToResolve).toBe(1);
  });

  it("keeps preview write-free and makes the build-safe page use preview then apply", () => {
    const api = readFileSync(
      new URL("../pages/api/admin/importar-asignaciones.ts", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../pages/admin/importar-asignaciones.astro", import.meta.url),
      "utf8",
    );
    expect(api).toContain('mode === "preview"');
    expect(api).toContain('client.rpc("apply_assignment_import_sync"');
    expect(api).toContain('formData.get("preview_signature") !== signature');
    expect(page).toContain("?mode=preview");
    expect(page).toContain("?mode=apply");
    expect(page).toContain('id="btn-apply"');
  });
});
