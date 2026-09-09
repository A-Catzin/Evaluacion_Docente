import { describe, expect, it } from "vitest";
import {
  assignedSubjectGroupForIssue,
  assignmentPayload,
  resolveImportIssueTarget,
} from "./importIssueReconciliation";

const issue = { plan: "Plan A", grupo: "A_1", clave_asignatura: "MAT-01" };
const base = {
  id: 11,
  clave: "A 1",
  plan_normalizado: "PLAN A",
  grado: "1",
  grupo_normalizado: "A 1",
  asignatura_id: null,
  docente_id: null,
  cuatrimestre_id: 4,
  num_alumnos: 24,
};

describe("import issue reconciliation", () => {
  it("resolves a base group and prepares its missing subject-assignment row", () => {
    const target = resolveImportIssueTarget(
      4,
      issue,
      [base],
      [{ id: 8, clave: "MAT-01" }],
    );
    expect(target.ok).toBe(true);
    if (!target.ok) return;

    expect(target.existing).toBeNull();
    expect(target.baseIds).toEqual([11]);
    expect(assignmentPayload(4, target, 55)).toMatchObject({
      cuatrimestre_id: 4,
      asignatura_id: 8,
      docente_id: 55,
      plan_normalizado: "PLAN A",
      grupo_normalizado: "A 1",
      grado: "1",
      num_alumnos: 24,
      importacion_key: "4|PLAN A|1|A 1|MAT-01",
    });
  });

  it("does not hide an open issue when the matching subject assignment is ambiguous or unassigned", () => {
    const assigned = {
      ...base,
      id: 12,
      asignatura_id: 8,
      docente_id: 55,
      asignaturas: { clave: "MAT-01" },
    };
    expect(assignedSubjectGroupForIssue(issue, [assigned])?.id).toBe(12);
    expect(
      assignedSubjectGroupForIssue(issue, [{ ...assigned, docente_id: null }]),
    ).toBeNull();
    expect(
      assignedSubjectGroupForIssue(issue, [assigned, { ...assigned, id: 13 }]),
    ).toBeNull();
  });

  it("rejects group-only fallback across plans instead of choosing a base", () => {
    const target = resolveImportIssueTarget(
      4,
      { ...issue, plan: "Missing plan" },
      [base, { ...base, id: 21, plan_normalizado: "PLAN B" }],
      [{ id: 8, clave: "MAT-01" }],
    );
    expect(target).toMatchObject({
      ok: false,
      code: "import_issue_assignment_plan_ambiguous",
    });
  });

  it("resolves equivalent duplicate bases and retains every source ID", () => {
    const target = resolveImportIssueTarget(
      4,
      issue,
      [base, { ...base, id: 12 }],
      [{ id: 8, clave: "MAT-01" }],
    );
    expect(target).toMatchObject({
      ok: true,
      base: { id: 11 },
      baseIds: [11, 12],
    });
  });

  it("rejects a duplicate base candidate that already has a teacher", () => {
    const target = resolveImportIssueTarget(
      4,
      issue,
      [base, { ...base, id: 12, docente_id: 55 }],
      [{ id: 8, clave: "MAT-01" }],
    );
    expect(target).toMatchObject({
      ok: false,
      code: "import_issue_assignment_base_ambiguous",
    });
  });
});
