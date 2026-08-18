import { describe, expect, it } from "vitest";
import {
  MAX_COMENTARIO_LONGITUD,
  MAX_NOTA_SECCION_LONGITUD,
  validarCamposDeTextoLibre,
  validarCamposDeTextoLibreConLimites,
  validarComentarioOpcional,
} from "./moderation";

describe("moderation", () => {
  describe("validarComentarioOpcional", () => {
    it("acepta null, undefined y cadenas vacías", () => {
      expect(validarComentarioOpcional(null)).toEqual({
        valido: true,
        valorNormalizado: null,
      });
      expect(validarComentarioOpcional(undefined)).toEqual({
        valido: true,
        valorNormalizado: null,
      });
      expect(validarComentarioOpcional("")).toEqual({
        valido: true,
        valorNormalizado: null,
      });
      expect(validarComentarioOpcional("   ")).toEqual({
        valido: true,
        valorNormalizado: null,
      });
    });

    it("rechaza comentarios que superan la longitud máxima", () => {
      const largo = "a".repeat(MAX_COMENTARIO_LONGITUD + 1);
      const resultado = validarComentarioOpcional(largo);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain(`${MAX_COMENTARIO_LONGITUD}`);
    });

    it("acepta comentarios dentro del límite", () => {
      const resultado = validarComentarioOpcional("Me gustó la clase");
      expect(resultado.valido).toBe(true);
      expect(resultado.valorNormalizado).toBe("Me gustó la clase");
    });

    it("recorta espacios al validar", () => {
      const resultado = validarComentarioOpcional("  texto  ");
      expect(resultado.valorNormalizado).toBe("texto");
    });

    it("rechaza comentarios con lenguaje inapropiado", () => {
      const resultado = validarComentarioOpcional("Eres un idiota");
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain("idiota");
    });

    it("permite cambiar la longitud máxima", () => {
      const resultado = validarComentarioOpcional("abc", 2);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain("2");
    });
  });

  describe("validarCamposDeTextoLibre", () => {
    it("valida varios campos y devuelve valores normalizados", () => {
      const resultado = validarCamposDeTextoLibre(
        { a: "Hola", b: null, c: "" },
        ["a", "b", "c"],
      );
      expect(resultado.valido).toBe(true);
      expect(resultado.valores).toEqual({ a: "Hola", b: null, c: null });
    });

    it("reporta el primer campo con contenido inapropiado", () => {
      const resultado = validarCamposDeTextoLibre({ a: "bien", b: "idiota" }, [
        "a",
        "b",
      ]);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain("[b]");
      expect(resultado.error).toContain("idiota");
    });
  });

  describe("validarCamposDeTextoLibreConLimites", () => {
    it("aplica límites distintos por campo", () => {
      const resultado = validarCamposDeTextoLibreConLimites(
        { corto: "ok", largo: "a".repeat(MAX_NOTA_SECCION_LONGITUD + 1) },
        { corto: 10, largo: MAX_NOTA_SECCION_LONGITUD },
      );
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain("[largo]");
      expect(resultado.error).toContain(`${MAX_NOTA_SECCION_LONGITUD}`);
    });

    it("acepta campos vacíos bajo distintos límites", () => {
      const resultado = validarCamposDeTextoLibreConLimites(
        { a: "", b: null },
        { a: 5, b: 10 },
      );
      expect(resultado.valido).toBe(true);
      expect(resultado.valores).toEqual({ a: null, b: null });
    });
  });
});
