import { describe, expect, it } from "vitest";
import {
  checkRequestBodySize,
  MAX_EVALUACION_BODY_BYTES,
  MAX_IMPORT_FILE_BYTES,
  verificarLimiteEnviosEstudiante,
} from "./rateLimit";

function createMockRequest(contentLength?: number): Request {
  const headers = new Headers();
  if (contentLength !== undefined)
    headers.set("content-length", String(contentLength));
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: "{}",
  });
}

interface MockScenario {
  maybeSingle?: unknown;
  count?: number | null;
  countError?: Error | null;
}

/**
 * Crea un cliente Supabase mínimo para los tests de rate limiting.
 * Soporta encadenamiento infinito y devuelve:
 * - { data, error: null } en maybeSingle()
 * - { data: null, error, count } al resolver la promesa final.
 */
function createMockSupabaseClient(scenarios: MockScenario[] = []): any {
  let callIndex = 0;
  const gteColumns: string[] = [];

  function nextScenario(): MockScenario {
    const scenario = scenarios[callIndex] ?? {};
    callIndex += 1;
    return scenario;
  }

  const chain: any = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "maybeSingle") {
          const scenario = nextScenario();
          return async () => ({
            data: scenario.maybeSingle ?? null,
            error: null,
          });
        }

        if (prop === "then") {
          return (resolve: (value: unknown) => void) => {
            const scenario = nextScenario();
            const result = {
              data: null,
              error: scenario.countError ?? null,
              count: scenario.count ?? null,
            };
            return Promise.resolve(result).then(resolve);
          };
        }

        if (prop === "gte") {
          return (column: string) => {
            gteColumns.push(column);
            return chain;
          };
        }

        return () => chain;
      },
    },
  );

  return {
    from: () => chain,
    gteColumns,
  };
}

describe("rateLimit", () => {
  describe("checkRequestBodySize", () => {
    it("permite requests dentro del límite", () => {
      const request = createMockRequest(MAX_EVALUACION_BODY_BYTES - 1);
      const resultado = checkRequestBodySize(
        request,
        MAX_EVALUACION_BODY_BYTES,
      );
      expect(resultado.ok).toBe(true);
      expect(resultado.size).toBe(MAX_EVALUACION_BODY_BYTES - 1);
    });

    it("rechaza requests que superan el límite", () => {
      const request = createMockRequest(MAX_EVALUACION_BODY_BYTES + 1);
      const resultado = checkRequestBodySize(
        request,
        MAX_EVALUACION_BODY_BYTES,
      );
      expect(resultado.ok).toBe(false);
      expect(resultado.size).toBe(MAX_EVALUACION_BODY_BYTES + 1);
      expect(resultado.error).toContain(`${MAX_EVALUACION_BODY_BYTES}`);
    });

    it("permite requests sin Content-Length", () => {
      const request = createMockRequest(undefined);
      const resultado = checkRequestBodySize(
        request,
        MAX_EVALUACION_BODY_BYTES,
      );
      expect(resultado.ok).toBe(true);
      expect(resultado.size).toBeUndefined();
    });

    it("rechaza Content-Length no numérico", () => {
      const headers = new Headers({ "content-length": "invalid" });
      const request = new Request("http://localhost", {
        method: "POST",
        headers,
      });
      const resultado = checkRequestBodySize(
        request,
        MAX_EVALUACION_BODY_BYTES,
      );
      expect(resultado.ok).toBe(true);
    });
  });

  describe("constantes", () => {
    it("define los límites esperados", () => {
      expect(MAX_EVALUACION_BODY_BYTES).toBe(50 * 1024);
      expect(MAX_IMPORT_FILE_BYTES).toBe(25 * 1024 * 1024);
    });
  });

  describe("verificarLimiteEnviosEstudiante", () => {
    it("permite el envío cuando no hay registros previos", async () => {
      const client = createMockSupabaseClient([
        { maybeSingle: null },
        { count: 0 },
        { count: 0 },
      ]);
      const resultado = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
        cuatrimestreId: 100,
      });
      expect(resultado.permitido).toBe(true);
    });

    it("rechaza un envío duplicado para el mismo grupo", async () => {
      const client = createMockSupabaseClient([{ maybeSingle: { id: 1 } }]);
      const resultado = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
        cuatrimestreId: 100,
      });
      expect(resultado.permitido).toBe(false);
      expect(resultado.razon).toContain("Ya enviaste");
    });

    it("rechaza cuando se supera el límite de envíos recientes", async () => {
      const client = createMockSupabaseClient([
        { maybeSingle: null },
        { count: 10 },
      ]);
      const resultado = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
        cuatrimestreId: 100,
        maxPerWindow: 10,
      });
      expect(resultado.permitido).toBe(false);
      expect(resultado.razon).toContain("Demasiados envíos recientes");
      expect(resultado.enviosRecientes).toBe(10);
    });

    it("usa fecha_envio como el timestamp canónico de los controles", async () => {
      const client = createMockSupabaseClient([
        { maybeSingle: null },
        { count: 0 },
        { count: 0 },
      ]);

      await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
        cuatrimestreId: 100,
      });

      expect(client.gteColumns).toEqual(["fecha_envio"]);
    });

    it("rechaza cuando se supera el límite por ciclo", async () => {
      const client = createMockSupabaseClient([
        { maybeSingle: null },
        { count: 1 },
        { count: 200 },
      ]);
      const resultado = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
        cuatrimestreId: 100,
        maxPerCiclo: 200,
      });
      expect(resultado.permitido).toBe(false);
      expect(resultado.razon).toContain("Límite de evaluaciones alcanzado");
    });

    it("no verifica total por ciclo si no se proporciona cuatrimestreId", async () => {
      const client = createMockSupabaseClient([
        { maybeSingle: null },
        { count: 0 },
      ]);
      const resultado = await verificarLimiteEnviosEstudiante(client, {
        estudianteId: 1,
        grupoId: 10,
      });
      expect(resultado.permitido).toBe(true);
    });
  });
});
