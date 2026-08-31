import { describe, expect, it } from "vitest";
import { describeEvaluatorLoadFailure } from "./observationAllocationEvaluatorError";

describe("observation allocation evaluator failure diagnostics", () => {
  it("maps the confirmed return-contract error to an actionable safe diagnosis", () => {
    expect(describeEvaluatorLoadFailure({ code: "42804" })).toEqual({
      code: "EVAL_RPC_42804",
      cause: "El contrato de retorno del RPC no coincide. Aplica la migración 054 y recarga la caché de PostgREST.",
    });
  });

  it("does not expose an unsafe provider error code", () => {
    expect(describeEvaluatorLoadFailure({ code: "unsafe code! with details" })).toEqual({
      code: "EVAL_RPC_UNKNOWN",
      cause: "El RPC rechazó la consulta. Ejecuta las verificaciones de función, firma y permisos documentadas para este código.",
    });
  });
});
