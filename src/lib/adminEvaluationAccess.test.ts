import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/admin/evaluar-docentes.astro", import.meta.url), "utf8");
const observationMenu = readFileSync(new URL("../pages/admin/evaluar-docentes/observacion.astro", import.meta.url), "utf8");

describe("admin observation access", () => {
  it("keeps the admin teacher list scoped to active observation assignments", () => {
    expect(page).toContain(".from('observation_teacher_assignments')");
    expect(page).toContain(".eq('evaluator_id', auth.user.id)");
    expect(page).toContain(".is('revoked_at', null)");
    expect(page).not.toContain("from('docentes').select('id').eq('activo', true)");
  });

      it("marks assigned teachers with an existing observation for reevaluation", () => {
        expect(page).toContain(".from('instrument_submissions')");
        expect(page).toContain("hasObservation");
        expect(page).toContain("Reevaluar docente");
      });

      it("keeps the admin menu on the revision-capable observation routes", () => {
    expect(observationMenu).toContain("/coordinador/captura/observacion-escolarizado");
    expect(observationMenu).toContain("/coordinador/captura/observacion-virtual");
    expect(observationMenu).toContain("/coordinador/captura/observacion-ejecutivo");
  });
});
