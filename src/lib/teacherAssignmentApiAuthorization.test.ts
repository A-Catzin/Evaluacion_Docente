import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../pages/api/coordinador/", import.meta.url);

describe("coordinator assignment API authorization", () => {
  it("checks assignment authority before each protected capture write", () => {
    const coordination = readFileSync(new URL("evaluacion-coordinacion.ts", root), "utf8");
    const observation = readFileSync(new URL("observacion.ts", root), "utf8");
    const planning = readFileSync(new URL("planeacion.ts", root), "utf8");
    expect(coordination.indexOf("canManageCoordinatedTeacher")).toBeLessThan(coordination.indexOf('.from("evaluacion_coordinacion")'));
    expect(observation.indexOf("canObserveAssignedTeacher")).toBeLessThan(observation.indexOf('.from("observaciones")'));
    expect(planning.indexOf("canManageCoordinatedTeacher")).toBeLessThan(planning.indexOf('.update({'));
  });
});
