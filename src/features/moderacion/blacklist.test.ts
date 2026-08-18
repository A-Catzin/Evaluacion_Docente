import { describe, expect, it } from "vitest";
import { moderarComentario, moderarComentarioLegado } from "./blacklist";

describe("moderacion/blacklist", () => {
  describe("moderarComentario", () => {
    it("aprueba textos vacíos o con solo espacios", () => {
      expect(moderarComentario("")).toEqual({ aprobado: true });
      expect(moderarComentario("   ")).toEqual({ aprobado: true });
    });

    it("aprueba comentarios sin palabras prohibidas", () => {
      expect(moderarComentario("Buena clase, aprendí mucho")).toEqual({
        aprobado: true,
      });
    });

    it("rechaza comentarios con palabras de la blacklist", () => {
      const resultado = moderarComentario("Este profesor es un idiota");
      expect(resultado.aprobado).toBe(false);
      expect(resultado.motivo).toContain("idiota");
    });

    it("es insensible a mayúsculas y acentos de la blacklist (según la implementación)", () => {
      const resultado = moderarComentario("IDIOTA");
      expect(resultado.aprobado).toBe(false);
      expect(resultado.motivo?.toLowerCase()).toContain("idiota");
    });

    it("detecta múltiples palabras prohibidas", () => {
      const resultado = moderarComentario("idiota y tonto");
      expect(resultado.aprobado).toBe(false);
      expect(resultado.motivo).toContain("idiota");
      expect(resultado.motivo).toContain("tonto");
    });

    it("no genera falsos positivos con subcadenas", () => {
      expect(moderarComentario("El puente es muy alto")).toEqual({
        aprobado: true,
      });
    });
  });

  describe("moderarComentarioLegado", () => {
    it("mantiene compatibilidad de forma", () => {
      const resultado = moderarComentarioLegado("comentario idiota");
      expect(resultado.esApropiado).toBe(false);
      expect(resultado.palabrasDetectadas).toContain("idiota");
    });
  });
});
