import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../pages/api/docente/", import.meta.url);
const endpoints = ["planeacion.ts", "planeacion-subir.ts", "subir-archivo.ts"];

const uploadEndpoints = ["planeacion-subir.ts", "subir-archivo.ts"];

describe("planning write endpoint guards", () => {
  it("checks the shared access guard before any upload reads file bytes", () => {
    for (const endpoint of endpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      expect(source).toContain("requireTeacherPlanningSubmissionOpen");
      if (source.includes("file.arrayBuffer()")) {
        expect(
          source.indexOf("requireTeacherPlanningSubmissionOpen"),
        ).toBeLessThan(source.indexOf("file.arrayBuffer()"));
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

  it("sets new planning inserts to Pendiente in both upload endpoints", () => {
    for (const endpoint of uploadEndpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      expect(source).toMatch(/estado:\s*["']Pendiente["']/);
    }
  });

  it("overrides the no_aplica_count default with NULL on new planning inserts", () => {
    for (const endpoint of uploadEndpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      const insertIndex = source.indexOf(".insert({");
      const insertEnd = source.indexOf("});", insertIndex);

      expect(insertIndex).toBeGreaterThanOrEqual(0);
      expect(insertEnd).toBeGreaterThan(insertIndex);
      expect(source.slice(insertIndex, insertEnd)).toMatch(
        /no_aplica_count:\s*null/,
      );

      const updateIndex = source.indexOf(".update(datos)");
      if (updateIndex >= 0) {
        const datosIndex = source.indexOf("const datos = {");
        expect(source.slice(datosIndex, updateIndex)).not.toMatch(
          /no_aplica_count/,
        );
      }
    }
  });

  it("requires the canonical Escolarizado modality in both upload endpoints", () => {
    for (const endpoint of uploadEndpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      expect(source).toContain("Escolarizado");
      expect(source).not.toContain("Escolarizada");
      expect(source).toContain(
        "Solo se aceptan planeaciones en modalidad Escolarizado",
      );
    }
  });

  it("returns safe categorized storage and persistence failures", () => {
    for (const endpoint of uploadEndpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");
      expect(source).toContain('code: "storage_upload_failed"');
      expect(source).toContain('code: "planning_persistence_rejected"');
      expect(source).toContain('code: "planning_persistence_failed"');
      expect(source).not.toContain("+ dbErr.message");
      expect(source).not.toContain("+ dbError.message");
    }
  });
});
