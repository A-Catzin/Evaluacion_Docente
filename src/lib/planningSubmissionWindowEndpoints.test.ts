import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../pages/api/docente/", import.meta.url);
const currentUploadEndpoint = "subir-archivo.ts";
const retiredEndpoints = ["planeacion.ts", "planeacion-subir.ts"];

describe("planning write endpoint guards", () => {
  it("keeps the shared access guard ahead of file-byte reads on the current upload endpoint", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");

    expect(source).toContain("requireTeacherPlanningSubmissionOpen");
    expect(source.indexOf("requireTeacherPlanningSubmissionOpen")).toBeLessThan(
      source.indexOf("file.arrayBuffer()"),
    );
    expect(source).toContain("buildPlanningPdfPath");
    expect(source).not.toContain('formData.get("path")');
  });

  it("rejects oversized multipart fallback PDFs before buffering file bytes", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
    const multipartLimit = source.indexOf(
      "file.size > MAX_MULTIPART_PLANNING_PDF_BYTES",
    );
    const byteRead = source.indexOf("file.arrayBuffer()");

    expect(multipartLimit).toBeGreaterThanOrEqual(0);
    expect(source).toContain('code: "planning_multipart_pdf_too_large"');
    expect(source).toContain("status: 413");
    expect(multipartLimit).toBeLessThan(byteRead);
  });

  it("retires legacy upload endpoints without request parsing, authentication, or writes", () => {
    for (const endpoint of retiredEndpoints) {
      const source = readFileSync(new URL(endpoint, root), "utf8");

      expect(source).toContain('code: "planning_endpoint_retired"');
      expect(source).toContain("status: 410");
      expect(source).toContain('"Content-Type": "application/json"');
      expect(source).not.toContain("requireRole");
      expect(source).not.toContain("request.formData");
      expect(source).not.toContain("request.json");
      expect(source).not.toContain("file.arrayBuffer");
      expect(source).not.toContain("subirArchivo");
      expect(source).not.toContain(".storage");
      expect(source).not.toContain(".from(");
    }
  });

  it("rechecks the persisted plan owner and cycle before a resubmission", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
    expect(source).toContain("plan.docente_id !== u.entidad_id");
    expect(source).toContain("plan.cuatrimestre_id !== cuatrimestreId");
    expect(source).toContain('plan.estado !== "Corrección"');
  });

  it("sets new planning inserts to Pendiente", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
    expect(source).toMatch(/estado:\s*["']Pendiente["']/);
  });

  it("overrides the no_aplica_count default with NULL on new planning inserts", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
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
  });

  it("requires the canonical Escolarizado modality", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
    expect(source).toContain("Escolarizado");
    expect(source).not.toContain("Escolarizada");
    expect(source).toContain(
      "Solo se aceptan planeaciones en modalidad Escolarizado",
    );
  });

  it("returns safe categorized storage and persistence failures", () => {
    const source = readFileSync(new URL(currentUploadEndpoint, root), "utf8");
    expect(source).toContain('code: "storage_upload_failed"');
    expect(source).toContain('code: "planning_persistence_rejected"');
    expect(source).toContain('code: "planning_persistence_failed"');
    expect(source).not.toContain("+ dbErr.message");
    expect(source).not.toContain("+ dbError.message");
  });
});
