import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../pages/admin/asignaciones.astro", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../pages/api/admin/asignar-docentes.ts", import.meta.url),
  "utf8",
);

describe("teacher candidate eligibility UI", () => {
  it("does not render candidate RPC failures as empty lists", () => {
    expect(page).toContain("const teacherCandidateLoadFailed = Boolean(teacherCandidateLoadError)");
    expect(page).toContain("No se pudo cargar la lista de docentes candidatos");
    expect(page).toContain("No se muestran datos parciales");
  });

  it("shows aggregate eligibility counts and keeps the all-active scope explicit on assignment", () => {
    expect(page).toContain("admin_assignment_teacher_candidate_diagnostics");
    expect(page).toContain("No hay docentes elegibles en el cuatrimestre; no es un error de carga.");
    expect(page).toContain("include_all_active: type === 'coordinated' ? coordinatedAll : observationAll");
    expect(api).toContain("typeof include_all_active !== 'boolean'");
    expect(api).toContain("p_include_all_active: include_all_active");
  });
});
