import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../pages/api/docente/", import.meta.url);
const endpoints = ["planeacion.ts", "planeacion-subir.ts", "subir-archivo.ts"];

describe("planning write endpoint guards", () => {
  it("checks the shared access guard before any upload reads file bytes", () => {
    for (const endpoint of endpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      expect(source).toContain("requireTeacherPlanningSubmissionOpen");
      if (source.includes("file.arrayBuffer()")) {
        expect(source.indexOf("requireTeacherPlanningSubmissionOpen")).toBeLessThan(source.indexOf("file.arrayBuffer()"));
        expect(source).toContain("buildPlanningPdfPath");
        expect(source).not.toContain('formData.get("path")');
      }
    }
  });

  it("rechecks the persisted plan owner and cycle before a resubmission", () => {
    const source = readFileSync(new URL("subir-archivo.ts", root), "utf8");
    expect(source).toContain("plan.docente_id !== u.entidad_id");
    expect(source).toContain("plan.cuatrimestre_id !== cuatrimestreId");
    expect(source).toContain('plan.estado !== "Corrección"');
  });
});
