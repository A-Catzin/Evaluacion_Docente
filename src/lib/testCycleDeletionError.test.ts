import { describe, expect, it } from "vitest";
import { describeTestCycleDeletionFailure } from "./testCycleDeletionError";

describe("test cycle deletion RPC failures", () => {
  it("maps the server safeguards without returning database details", () => {
    expect(describeTestCycleDeletionFailure({ code: "TC001", message: "test cycle is active" }).code).toBe("test_cycle_active");
    expect(describeTestCycleDeletionFailure({ code: "TC002", message: "test cycle is not marked as test" }).code).toBe("test_cycle_unmarked");
    expect(describeTestCycleDeletionFailure({ code: "TC003", message: "cycle confirmation does not match" }).code).toBe("test_cycle_confirmation_mismatch");
    expect(describeTestCycleDeletionFailure({ code: "TC004", message: "test cycle dependency guard blocked deletion" }).code).toBe("test_cycle_dependency_guard");
  });

  it("identifies an unavailable RPC as a migration compatibility problem", () => {
    const result = describeTestCycleDeletionFailure({ code: "PGRST202", message: "Could not find the function public.delete_test_cycle" });
    expect(result.code).toBe("test_cycle_rpc_missing");
    expect(result.error).not.toContain("public.delete_test_cycle");
  });

  it("keeps unknown database failures generic", () => {
    const result = describeTestCycleDeletionFailure({ code: "XX000", message: "internal relation details" });
    expect(result).toEqual({ code: "test_cycle_failed", error: "No fue posible eliminar el ciclo de prueba. No se realizaron cambios." });
  });

  it("marks statement timeouts and transactional contention as safe retries", () => {
    expect(describeTestCycleDeletionFailure({ code: "57014", message: "canceling statement due to statement timeout" })).toEqual({
      code: "test_cycle_retryable",
      error: "La eliminación no se completó por un problema temporal. No se realizaron cambios; espera y vuelve a intentarlo.",
    });
    expect(describeTestCycleDeletionFailure({ code: "40001", message: "could not serialize access" }).code).toBe("test_cycle_retryable");
    expect(describeTestCycleDeletionFailure({ code: "23503", message: "foreign key violation" }).code).toBe("test_cycle_dependency_guard");
  });
});
