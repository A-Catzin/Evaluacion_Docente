import { describe, expect, it } from "vitest";
import {
  findAmbiguousStudentImportRows,
  normalizeStudentImportEmail,
} from "./studentImportIdentity";

describe("studentImportIdentity", () => {
  describe("normalizeStudentImportEmail", () => {
    it("recorta espacios y convierte el correo a minúsculas", () => {
      expect(normalizeStudentImportEmail("  Alumno@EXAMPLE.COM  ")).toBe(
        "alumno@example.com",
      );
    });
  });

  describe("findAmbiguousStudentImportRows", () => {
    it("permite repetir el mismo correo para la misma matrícula", () => {
      expect(
        findAmbiguousStudentImportRows([
          { rowNumber: 2, email: " alumno@example.com ", matricula: " A-01 " },
          { rowNumber: 3, email: "ALUMNO@EXAMPLE.COM", matricula: "a-01" },
        ]),
      ).toEqual(new Set());
    });

    it("marca todas las filas cuando un correo corresponde a matrículas distintas", () => {
      expect(
        findAmbiguousStudentImportRows([
          { rowNumber: 2, email: " alumno@example.com ", matricula: "A-01" },
          { rowNumber: 3, email: "ALUMNO@EXAMPLE.COM", matricula: "a-01" },
          { rowNumber: 4, email: "ALUMNO@EXAMPLE.COM", matricula: "B-02" },
          { rowNumber: 5, email: "otro@example.com", matricula: "C-03" },
        ]),
      ).toEqual(new Set([2, 3, 4]));
    });
  });
});
