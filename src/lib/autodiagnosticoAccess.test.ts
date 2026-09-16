import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const middleware = new URL("../middleware.ts", import.meta.url);
const dashboardPage = new URL(
  "../pages/docente/dashboard.astro",
  import.meta.url,
);
const autodiagnosticoPage = new URL(
  "../pages/docente/autodiagnostico.astro",
  import.meta.url,
);
const catalogosService = new URL("../services/catalogos.ts", import.meta.url);

function expectCatalogUsesAuthenticatedClient(
  source: string,
  functionName: string,
  tableName: string,
) {
  const functionStart = source.indexOf(
    `export async function ${functionName}(`,
  );
  const functionEnd = source.indexOf("\n}\n", functionStart) + 2;
  const functionSource = source.slice(functionStart, functionEnd);

  expect(functionStart).toBeGreaterThan(-1);
  expect(functionSource).toContain("cliente: SupabaseClient = db(),");
  expect(functionSource).toContain(
    `const { data, error } = await cliente\n  .from("${tableName}")`,
  );
}

describe("teacher autoevaluation access", () => {
  it("limits pending access to the dashboard and autoevaluation routes", () => {
    const source = readFileSync(middleware, "utf8");

    expect(source).toContain(
      '"/docente/dashboard": ["docente", "pendiente", "superadmin", "coordinador"]',
    );
    expect(source).toMatch(
      /"\/docente\/autodiagnostico":\s*\[\s*"docente",\s*"pendiente",\s*"superadmin",\s*"coordinador",?\s*\]/,
    );
    expect(source).toContain(
      '"/docente": ["docente", "superadmin", "coordinador"]',
    );
  });

  it("allows pending teachers to render the autoevaluation page", () => {
    const source = readFileSync(autodiagnosticoPage, "utf8");

    expect(source).toContain(
      "if (!usuario || !['docente', 'pendiente'].includes(usuario.rol))",
    );
  });

  it("falls back to and persists the newest available cycle on docente pages", () => {
    for (const page of [dashboardPage, autodiagnosticoPage]) {
      const source = readFileSync(page, "utf8");

      expect(source).toContain(
        "const cuatrimestreFallback = cuatrimestres[0];",
      );
      expect(source).toContain("cuatrimestreFallback?.id,");
      expect(source).toContain(
        "if (cuatrimestreId) {\n  Astro.cookies.set('cuatrimestre_sel'",
      );
    }
  });

  it("loads cycles through each page's authenticated client", () => {
    const dashboardSource = readFileSync(dashboardPage, "utf8");
    const autodiagnosticoSource = readFileSync(autodiagnosticoPage, "utf8");

    expect(dashboardSource).toContain("await obtenerCuatrimestreActivo(cl);");
    expect(dashboardSource).toContain("await obtenerCuatrimestres(cl);");
    expect(autodiagnosticoSource).toContain(
      "await obtenerCuatrimestreActivo(cliente);",
    );
    expect(autodiagnosticoSource).toContain(
      "await obtenerCuatrimestres(cliente);",
    );
    const dashboardSessionIndex = dashboardSource.indexOf(
      "await cl.auth.setSession(",
    );
    expect(dashboardSessionIndex).toBeGreaterThan(-1);
    expect(dashboardSessionIndex).toBeLessThan(
      dashboardSource.indexOf("await obtenerCuatrimestreActivo(cl)"),
    );
  });

  it("loads autoevaluation catalogs through the authenticated client", () => {
    const source = readFileSync(autodiagnosticoPage, "utf8");

    expect(source).toContain("await obtenerOfertasAcademicas(cliente);");
    expect(source).toContain("await obtenerCampus(cliente);");
    expect(source).toContain("await obtenerTurnos(cliente);");
  });

  it("queries autoevaluation catalogs through the supplied client", () => {
    const source = readFileSync(catalogosService, "utf8");

    expectCatalogUsesAuthenticatedClient(
      source,
      "obtenerOfertasAcademicas",
      "ofertas_academicas",
    );
    expectCatalogUsesAuthenticatedClient(source, "obtenerCampus", "campus");
    expectCatalogUsesAuthenticatedClient(source, "obtenerTurnos", "turnos");
  });

  it("does not request a score when no valid cycle is available", () => {
    const source = readFileSync(dashboardPage, "utf8");

    expect(source).toContain(
      "const calificacionFinal = docenteIdParaScore && cuatrimestreId > 0",
    );
  });

  it("emits request-scoped, safe diagnostics for autoevaluation access decisions", () => {
    const source = readFileSync(autodiagnosticoPage, "utf8");
    const loggerStart = source.indexOf("function logAutodiagnosticoAccess(");
    const loggerEnd = source.indexOf("\n}\n\n", loggerStart) + 2;
    const loggerSource = source.slice(loggerStart, loggerEnd);

    expect(source).toContain("const correlationId = crypto.randomUUID();");
    expect(source).toContain("const accessStartedAt = Date.now();");
    expect(loggerSource).toContain('event: "autodiagnostico_access"');
    expect(loggerSource).toContain("correlationId,");
    expect(loggerSource).toContain("elapsedMs: Date.now() - accessStartedAt,");
    expect(loggerSource).toContain("console.error({");

    for (const stage of [
      "session_missing",
      "session_invalid",
      "profile_or_role_rejected",
      "cycle_lookup_failed",
      "cycle_unresolved",
      "submission_window_unavailable",
      "already_completed",
    ]) {
      expect(source).toContain(`logAutodiagnosticoAccess("${stage}"`);
    }

    expect(source).toContain(
      "const { data: sesion, error: sesionError } = await cliente.auth.setSession",
    );
    expect(source).toContain("authError: safeErrorDetails(sesionError)");
    expect(source).toContain("cycleError: safeErrorDetails(error)");
    expect(source).toContain("availableCycleCount: cuatrimestres.length");
    expect(source).toContain(
      "availableCycleIds: cuatrimestres.map((c) => c.id)",
    );
    expect(source).toContain("configured: submissionWindow.configured");
    expect(source).toContain("mode: submissionWindow.mode");
    expect(source).toContain("state: submissionWindow.state");

    expect(loggerSource).not.toMatch(
      /email|token|cookie|nombre|apellido|comentario|reactivos/i,
    );
  });
});
