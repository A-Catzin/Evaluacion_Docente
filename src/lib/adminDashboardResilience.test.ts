import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("admin dashboard resilience", () => {
  it("uses an email-only profile greeting and precomputed scores", async () => {
    const source = await readFile(
      new URL("../pages/admin/dashboard.astro", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("nombre_completo");
    expect(source).toContain(".select('email')");
    expect(source).toContain("u?.email?.split('@')[0]");
    expect(source).toContain("incluirFallbackInline: false");
  });

  it("keeps admin docentes on the service-role precomputed score path", async () => {
    const source = await readFile(
      new URL("../pages/admin/docentes/index.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain("import { dbAdmin } from '../../../lib/db';");
    expect(source).toContain("const cliente = dbAdmin();");
    expect(source).toContain("obtenerCuatrimestreActivo(cliente)");
    expect(source).toContain("obtenerCuatrimestres(cliente)");
    expect(source).toMatch(
      /obtenerCalificacionesPorCuatrimestre\(cliente, cuatrimestreId, \{\s*incluirFallbackInline: false,\s*\}\)/,
    );
    expect(source).not.toContain("auth.setSession");
  });
});
