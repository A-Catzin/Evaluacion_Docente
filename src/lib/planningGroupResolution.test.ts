import { describe, expect, it } from "vitest";
import {
  classifyTeacherPlanningGroupResolution,
  type TeacherPlanningGroup,
} from "./planningSubmissionWindow";

const escolarizadoGroup: TeacherPlanningGroup = {
  id: 921,
  clave: "LECTURA Y ORATORIA T",
  modalidad: "Escolarizado",
};

describe("teacher planning group resolution", () => {
  it("keeps duplicate exact assignments ambiguous instead of selecting either row", () => {
    expect(
      classifyTeacherPlanningGroupResolution(
        [escolarizadoGroup, { ...escolarizadoGroup, id: 922 }],
        null,
      ),
    ).toEqual({ status: "ambiguous" });
  });

  it("rejects a unique non-Escolarizado assignment", () => {
    expect(
      classifyTeacherPlanningGroupResolution(
        [{ ...escolarizadoGroup, modalidad: "No Escolarizado" }],
        null,
      ),
    ).toEqual({ status: "non_escolarizado" });
  });

  it("categorizes empty and failed queries without exposing query details", () => {
    expect(classifyTeacherPlanningGroupResolution([], null)).toEqual({
      status: "not_found",
    });
    expect(
      classifyTeacherPlanningGroupResolution(null, {
        message: "database detail",
      }),
    ).toEqual({ status: "query_error" });
  });

  it("returns the sole Escolarizado assignment", () => {
    expect(
      classifyTeacherPlanningGroupResolution([escolarizadoGroup], null),
    ).toEqual({ status: "ok", group: escolarizadoGroup });
  });
});
