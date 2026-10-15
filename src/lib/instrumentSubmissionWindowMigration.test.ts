import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/092_instrument_submission_windows.sql",
    import.meta.url,
  ),
  "utf8",
);
const adminEndpoint = readFileSync(
  new URL("../pages/api/admin/instrumentos/acceso.ts", import.meta.url),
  "utf8",
);
const coordinationCapture = readFileSync(
  new URL("../pages/coordinador/captura/coordinacion.astro", import.meta.url),
  "utf8",
);
const observationCapture = readFileSync(
  new URL(
    "../pages/coordinador/captura/observacion-escolarizado.astro",
    import.meta.url,
  ),
  "utf8",
);

describe("instrument submission window migration", () => {
  it("creates independent fail-closed per-cycle windows and seeds only cycle 11 closed", () => {
    expect(migration).toContain(
      "CREATE TABLE public.instrument_submission_windows",
    );
    expect(migration).toContain("PRIMARY KEY (cuatrimestre_id, purpose)");
    expect(migration).toContain("purpose IN ('coordination', 'observation')");
    expect(migration).toContain("IF NOT FOUND THEN RETURN 'not_configured'");
    expect(migration).toContain("WHERE c.id = 11");
    expect(migration).toContain("'manual_closed'");
  });

  it("limits administration to superadmins, records audits, and guards final inserts", () => {
    expect(migration).toContain("instrument_submission_window_admin_list");
    expect(migration).toContain("instrument_submission_window_save");
    expect(migration).toContain("IF NOT public.audit_is_superadmin()");
    expect(migration).toContain("audit_instrument_submission_window_change");
    expect(migration).toContain(
      "BEFORE INSERT ON public.instrument_submissions",
    );
    expect(migration).toContain("instrument_submission_window_is_open");
    expect(migration).toContain("Final submissions are unavailable");
  });

  it("preserves the immutable submission history and leaves import issues untouched", () => {
    expect(migration).not.toContain("UPDATE public.instrument_submissions");
    expect(migration).not.toContain(
      "DELETE FROM public.instrument_submissions",
    );
    expect(migration).not.toContain("UPDATE public.import_issues");
    expect(migration).not.toContain("DELETE FROM public.import_issues");
  });

  it("keeps administration superadmin-only and hides closed capture forms", () => {
    expect(adminEndpoint).toContain('requireRole(cookies, ["superadmin"])');
    expect(adminEndpoint).toContain("instrument_submission_window_save");
    expect(adminEndpoint).toContain('"Cache-Control": "no-store"');
    for (const capture of [coordinationCapture, observationCapture]) {
      expect(capture).toContain("getInstrumentSubmissionWindow");
      expect(capture).toContain("window.state !== 'open'");
      expect(capture).toContain("instrumentSubmissionMessage");
    }
  });
});
