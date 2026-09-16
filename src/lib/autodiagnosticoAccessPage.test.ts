import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accessPage = new URL(
  "../pages/admin/autodiagnostico/acceso.astro",
  import.meta.url,
);

describe("admin autoevaluation access page", () => {
  it("loads and binds the selected cycle with the authenticated client", () => {
    const source = readFileSync(accessPage, "utf8");

    expect(source).toContain("auth.client\n  .from('cuatrimestres')");
    expect(source).toContain(".select('id,clave,activo')");
    expect(source).toContain("Astro.url.searchParams.get('cuatrimestre')");
    expect(source).toContain("const requestedCycle = cycles.find");
    expect(source).toContain('name="cuatrimestre_id" value={cuatrimestreId}');
    expect(source).not.toContain("obtenerCuatrimestres");
    expect(source).not.toContain("obtenerCuatrimestreActivo");
  });

  it("offers an explicit deactivate option that clears submission dates", () => {
    const source = readFileSync(accessPage, "utf8");

    expect(source).toContain('value="manual_closed"');
    expect(source).toContain("Desactivar autoevaluación");
    expect(source).toContain(
      "Conserva el historial completado y bloquea únicamente nuevos envíos.",
    );
    expect(source).toContain("opens_at: isScheduled ? data.get('opens_at') : null");
    expect(source).toContain("closes_at: isScheduled ? data.get('closes_at') : null");
    expect(source).toContain(
      "El servicio de configuración de acceso no está disponible. Inténtalo de nuevo.",
    );
  });
});
