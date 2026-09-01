import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const baseLayout = source("../layouts/BaseLayout.astro");

describe("selection card accessibility contract", () => {
  it("keeps selected, focused, disabled, and invalid cards readable", () => {
    expect(baseLayout).not.toContain("label:has(input:checked) { background-color");
    expect(baseLayout).toContain(".selection-card:has(input:checked)");
    expect(baseLayout).toContain("background-color: #1e3a5f !important");
    expect(baseLayout).toContain("color: #ffffff !important");
    expect(baseLayout).toContain(".selection-card--na:has(input:checked)");
    expect(baseLayout).toContain("background-color: #78350f !important");
    expect(baseLayout).toContain("input:focus-visible");
    expect(baseLayout).toContain("input:disabled");
    expect(baseLayout).toContain("input:user-invalid");
    expect(baseLayout).toContain("background-color: #991b1b !important");
  });

  it("uses the shared pattern in every radio or selectable-card renderer", () => {
    const selectionSources = [
      "../components/VersionedInstrumentCapture.astro",
      "../pages/pendiente.astro",
      "../pages/estudiante/evaluar/[grupoId].astro",
      "../pages/docente/autodiagnostico.astro",
      "../pages/admin/evaluar-docentes/coordinacion.astro",
      "../pages/admin/planeaciones/evaluar/[id].astro",
      "../pages/admin/planeaciones/acceso.astro",
      "../pages/admin/asignaciones.astro",
      "../pages/admin/avisos.astro",
      "../pages/admin/usuarios.astro",
    ];

    for (const path of selectionSources) {
      expect(source(path), path).toContain("selection-card");
    }
  });
});
