import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../pages/admin/asignaciones.astro", import.meta.url),
  "utf8",
);

describe("observation allocation evaluator UI", () => {
  it("does not render an RPC failure as an empty evaluator list", () => {
    expect(page).toContain("const evaluatorLoadFailed = Boolean(evaluatorResult.error)");
    expect(page).toContain("describeEvaluatorLoadFailure(evaluatorResult.error)");
    expect(page).toContain("No se pudo cargar la lista de evaluadores");
    expect(page).toContain("Código:");
    expect(page).toContain("No se muestran datos parciales");
    expect(page).toContain("disabled={evaluatorLoadFailed}");
  });

  it("uses aggregate diagnostics only when no evaluator is eligible", () => {
    expect(page).toContain("admin_observation_allocation_evaluator_diagnostics");
    expect(page).toContain("Diagnóstico sin datos personales");
    expect(page).toContain("evaluators.length === 0");
  });
});
