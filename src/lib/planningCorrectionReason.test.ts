import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyApi = readFileSync(
  new URL("../pages/api/coordinador/planeacion.ts", import.meta.url),
  "utf8",
);
const legacyCapture = readFileSync(
  new URL("../pages/admin/planeaciones/evaluar/[id].astro", import.meta.url),
  "utf8",
);
const versionedApi = readFileSync(
  new URL("../pages/api/instrumentos/submit.ts", import.meta.url),
  "utf8",
);
const versionedCapture = readFileSync(
  new URL("../components/VersionedInstrumentCapture.astro", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../pages/docente/dashboard.astro", import.meta.url),
  "utf8",
);
const planningPage = readFileSync(
  new URL("../pages/docente/planeaciones.astro", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/064_planning_correction_reason.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("planning correction reasons", () => {
  it("requires and moderates the legacy correction reason in the UI and API", () => {
    expect(legacyCapture).toContain("Motivo de corrección / retroalimentación");
    expect(legacyCapture).toContain(
      "estado === 'Corrección' && !motivoCorreccion",
    );
    expect(legacyApi).toContain("validarCamposDeTextoLibreConLimites");
    expect(legacyApi).toContain('estado === "Corrección" && !correctionReason');
    expect(legacyApi).toContain('code: "correction_reason_required"');
  });

  it("requires the versioned planning reason before the RPC and on the database boundary", () => {
    expect(versionedCapture).toContain(
      "Motivo de corrección / observaciones generales",
    );
    expect(versionedCapture).toContain(
      'definition.purpose === "planning" && excessiveNa && !generalObservations',
    );
    expect(versionedApi).toContain(
      "invalidPlanningSubmission && !correctionReason",
    );
    expect(versionedApi).toContain('code: "correction_reason_required"');
    expect(migration).toContain("v_correction_reason TEXT");
    expect(migration).toContain(
      "v_purpose = 'planning' AND v_status = 'invalid_excessive_na'",
    );
    expect(migration).toContain("RAISE EXCEPTION 'correction reason required'");
    expect(migration).toContain(
      "comentario_retroalimentacion = CASE WHEN v_status = 'valid' THEN NULL ELSE v_correction_reason END",
    );
  });

  it("shows correction records and their visible reason on both teacher surfaces", () => {
    expect(dashboard).toContain(".in('estado', ['Aprobado', 'Corrección'])");
    expect(dashboard).toContain("Motivo de corrección");
    expect(dashboard).toContain("p.asignaturas?.nombre");
    expect(planningPage).toContain(
      "estado: (p as Record<string,unknown>).estado === 'Corrección'",
    );
    expect(planningPage).toContain("? 'Corrección'");
    expect(planningPage).toContain("Motivo de corrección:");
    expect(planningPage).not.toContain("? 'Inválido por exceso de N/A'");
  });
});
