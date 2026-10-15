import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../pages/admin/coordinadores.astro", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../layouts/LayoutAdmin.astro", import.meta.url),
  "utf8",
);

describe("admin coordinator consultation", () => {
  it("uses the protected cycle-scoped assignment consultation", () => {
    expect(page).toContain("requireRole(Astro.cookies, ['superadmin'])");
    expect(page).toContain("admin_teacher_assignment_list_v2");
    expect(page).toContain("assignment_type === 'coordinated'");
    expect(page).toContain("cuatrimestre_id");
    expect(page).toContain("docentes");
    expect(page).not.toContain("observaciones");
    expect(page).not.toContain("evaluacion_coordinacion");
    expect(page).not.toContain("docentes-evaluados");
  });

  it("keeps the navigation link tied to the selected cycle", () => {
    expect(layout).toContain(
      "{ href: '/admin/coordinadores', label: 'Coordinadores', icon: '📊', cycleScoped: true }",
    );
  });
});
