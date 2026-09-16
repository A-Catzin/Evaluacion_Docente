import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../pages/", import.meta.url);
const apiRoot = new URL("api/", root);

describe("autodiagnostico submission window endpoints", () => {
  it("keeps the admin save endpoint superadmin-only and routed through the save RPC", () => {
    const source = readFileSync(
      new URL("admin/autodiagnostico/acceso.ts", apiRoot),
      "utf8",
    );

    expect(source).toContain('requireRole(cookies, ["superadmin"])');
    expect(source).toContain("parseAutodiagnosticoWindowInput");
    expect(source).toContain("autodiagnostico_submission_window_save");
    expect(source).toContain('"Cache-Control": "no-store"');
    expect(source).not.toContain('.from("autodiagnostico_submission_windows")');
  });

  it("checks the submission window after JSON validation and before profile writes", () => {
    const source = readFileSync(
      new URL("docente/autodiagnostico.ts", apiRoot),
      "utf8",
    );
    const guard = source.indexOf(
      "const accessResponse = await requireTeacherAutodiagnosticoSubmissionOpen",
    );
    const parsedBody = source.indexOf("AutodiagnosticoSchema.safeParse");
    const roleWrite = source.indexOf('.update({ rol: "docente" })');
    const teacherWrite = source.indexOf(
      '.from("docentes")\n          .update(',
    );
    const insert = source.indexOf("const { data: resultado, error: errDiag }");

    expect(guard).toBeGreaterThan(parsedBody);
    expect(guard).toBeLessThan(roleWrite);
    expect(guard).toBeLessThan(teacherWrite);
    expect(guard).toBeLessThan(insert);
    expect(source).toContain('.from("autodiagnosticos")');
    expect(source).not.toContain('.from("autoevaluacion_docente")');
  });
});
