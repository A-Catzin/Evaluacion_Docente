import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const accessPage = read("../pages/admin/instrumentos/acceso.astro");
const form = read("../components/admin/AccessWindowForm.astro");

describe("unified instrument access page", () => {
  it("loads and binds the selected cycle with the authenticated client", () => {
    expect(accessPage).toContain("auth.client\n  .from('cuatrimestres')");
    expect(accessPage).toContain(".select('id,clave,activo')");
    expect(accessPage).toContain("Astro.url.searchParams.get('cuatrimestre')");
    expect(accessPage).toContain("const requestedCycle = cycles.find");
    expect(form).toContain('name="cuatrimestre_id" value={cuatrimestreId}');
    expect(accessPage).not.toContain("obtenerCuatrimestres");
    expect(accessPage).not.toContain("obtenerCuatrimestreActivo");
  });

  it("configures every instrument window from one page", () => {
    for (const endpoint of [
      "/api/admin/instrumentos/acceso",
      "/api/admin/planeaciones/acceso",
      "/api/admin/autodiagnostico/acceso",
    ]) {
      expect(accessPage).toContain(endpoint);
    }
    for (const purpose of ["student_survey", "coordination", "observation"]) {
      expect(accessPage).toContain(`purpose="${purpose}"`);
    }
  });

  it("offers an explicit close option that clears submission dates", () => {
    expect(form).toContain('value="manual_closed"');
    expect(accessPage).toContain(
      "Conserva el historial completado y bloquea únicamente nuevos envíos.",
    );
    expect(accessPage).toContain("opens_at: isScheduled ? data.get('opens_at') : null");
    expect(accessPage).toContain("closes_at: isScheduled ? data.get('closes_at') : null");
    expect(accessPage).toContain(
      "El servicio de configuración de acceso no está disponible. Inténtalo de nuevo.",
    );
  });

  it("keeps the old pages as redirects and drops the separate planning menu entry", () => {
    for (const old of ["../pages/admin/planeaciones/acceso.astro", "../pages/admin/autodiagnostico/acceso.astro"]) {
      expect(read(old)).toContain("Astro.redirect(`/admin/instrumentos/acceso");
    }
    expect(read("../layouts/LayoutAdmin.astro")).not.toContain("Acceso a planeaciones");
  });
});
