import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST as completeUpload } from "../pages/api/docente/planeacion-upload-complete";
import { POST as mintUploadUrl } from "../pages/api/docente/planeacion-upload-url";

const endpoints = new URL("../pages/api/docente/", import.meta.url);
const page = new URL("../pages/docente/planeaciones.astro", import.meta.url);
const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");

function source(name: string): string {
  return readFileSync(new URL(name, endpoints), "utf8");
}

describe("direct planning PDF upload contracts", () => {
  it("loads both direct-upload API route modules", () => {
    expect(typeof mintUploadUrl).toBe("function");
    expect(typeof completeUpload).toBe("function");
  });

  it("mints only a server-owned R2 PUT path after authentication and window validation", () => {
    const uploadUrl = source("planeacion-upload-url.ts");
    expect(uploadUrl).toContain('requireRole(cookies, ["docente"])');
    expect(uploadUrl).toContain("requireTeacherPlanningSubmissionOpen");
    expect(uploadUrl).toContain("buildPlanningPdfPath");
    expect(uploadUrl).toContain("crearUrlSubidaR2Firmada");
    expect(uploadUrl).toContain("upload_headers: uploadHeaders");
    expect(uploadUrl).toContain('"Content-Type": "application/pdf"');
    expect(uploadUrl).toContain('"If-None-Match": "*"');
    expect(uploadUrl).not.toContain('"x-amz-meta-expected-content-length"');
    expect(uploadUrl).toContain("code: R2_DIRECT_UPLOAD_UNAVAILABLE");
    expect(uploadUrl).not.toContain("body.path");
  });

  it("finalizes only a scoped R2 object after repeating planning authorization checks", () => {
    const complete = source("planeacion-upload-complete.ts");
    expect(complete).toContain("isTeacherPlanningPdfPath");
    expect(complete).toContain("obtenerCabeceraArchivoR2");
    expect(complete).toContain("objectHead.contentLength !== body.file_size");
    expect(complete).toContain('objectHead.contentType !== "application/pdf"');
    expect(complete).toContain("resolveTeacherPlanningGroup");
    expect(complete).toContain('eq("modalidad", "Escolarizado")');
    expect(complete).toContain("planning_assignment_ambiguous");
    expect(complete).toContain("planning_subject_scope_conflict");
    expect(complete).toContain("notificarCoordinadoresDocente");
    expect(complete).not.toContain("body.url");
  });

  it("uploads directly before completion and uses multipart only for the R2-unavailable small-file fallback", () => {
    const client = readFileSync(page, "utf8");
    const initialize = client.indexOf("/api/docente/planeacion-upload-url");
    const put = client.indexOf("method:'PUT'");
    const complete = client.indexOf("/api/docente/planeacion-upload-complete");
    const fallback = client.indexOf("r2_direct_upload_unavailable");
    const legacy = client.indexOf("/api/docente/subir-archivo");
    expect(initialize).toBeGreaterThanOrEqual(0);
    expect(put).toBeGreaterThan(initialize);
    expect(complete).toBeGreaterThan(put);
    expect(fallback).toBeGreaterThan(complete);
    expect(legacy).toBeGreaterThan(fallback);
    expect(client).toContain("maxPlanningPdfBytes=30*1024*1024");
    expect(client).toContain("maxLegacyMultipartBytes=4*1024*1024");
    expect(client).toContain("headers:uploadHeaders");
    expect(client).toContain("uploadHeaders['Content-Type']!==file.type");
    expect(client).toContain("uploadHeaders['If-None-Match']!=='*'");
    expect(client).not.toContain("x-amz-meta-expected-content-length");
  });

  it("signs only browser-settable PUT headers and documents post-upload length verification", () => {
    expect(storage).not.toContain("ContentLength: contentLength");
    expect(storage).not.toContain(
      'Metadata: { "expected-content-length": String(contentLength) }',
    );
    expect(storage).toContain('IfNoneMatch: "*"');
    expect(storage).toContain("Content-Type and If-None-Match");
    expect(storage).toContain(
      "does not enforce an exact object\n// size before creation",
    );
  });
});
