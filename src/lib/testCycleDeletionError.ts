type RpcErrorLike = {
  code?: unknown;
  message?: unknown;
};

export type TestCycleDeletionFailure = {
  code:
    | "test_cycle_active"
    | "test_cycle_unmarked"
    | "test_cycle_confirmation_mismatch"
    | "test_cycle_dependency_guard"
    | "test_cycle_rpc_missing"
    | "test_cycle_not_found"
    | "test_cycle_forbidden"
    | "test_cycle_retryable"
    | "test_cycle_failed";
  error: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function describeTestCycleDeletionFailure(error: unknown): TestCycleDeletionFailure {
  const rpc = (error && typeof error === "object" ? error : {}) as RpcErrorLike;
  const code = text(rpc.code).toUpperCase();
  const message = text(rpc.message);

  if (code === "TC001" || message.includes("test cycle is active") || message.includes("active cycle cannot be marked")) {
    return { code: "test_cycle_active", error: "El ciclo está activo. Ciérralo o desactívalo antes de eliminarlo." };
  }
  if (code === "TC002" || message.includes("test cycle is not marked")) {
    return { code: "test_cycle_unmarked", error: "El ciclo no está marcado como prueba. Márcalo primero con la confirmación exacta." };
  }
  if (code === "TC003" || message.includes("cycle confirmation does not match")) {
    return { code: "test_cycle_confirmation_mismatch", error: "La confirmación no coincide exactamente con la etiqueta actual del ciclo." };
  }
  if (code === "TC004" || message.includes("test cycle dependency guard") || message.includes("unreviewed cycle dependency") || message.includes("cycle dependency has no reviewed scope") || code === "23503") {
    return { code: "test_cycle_dependency_guard", error: "La protección de dependencias bloqueó la eliminación. Revisa la compatibilidad de la base antes de reintentar." };
  }
  if (code === "TC005" || message.includes("cycle not found")) {
    return { code: "test_cycle_not_found", error: "El ciclo ya no está disponible. Actualiza la página antes de reintentar." };
  }
  if (code === "PGRST202" || code === "42883" || message.includes("could not find the function")) {
    return { code: "test_cycle_rpc_missing", error: "Falta o no está actualizada la migración de eliminación segura. Solicita aplicar las migraciones y recargar el esquema." };
  }
  if (code === "42501") {
    return { code: "test_cycle_forbidden", error: "Tu sesión no puede realizar esta eliminación. Inicia sesión como superadmin." };
  }
  if (code === "57014" || code === "40001" || code === "40P01" || code === "55P03" || message.includes("statement timeout")) {
    return { code: "test_cycle_retryable", error: "La eliminación no se completó por un problema temporal. No se realizaron cambios; espera y vuelve a intentarlo." };
  }
  return { code: "test_cycle_failed", error: "No fue posible eliminar el ciclo de prueba. No se realizaron cambios." };
}
