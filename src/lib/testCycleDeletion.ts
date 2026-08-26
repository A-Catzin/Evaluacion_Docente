export type TestCycleDeletionRequest = {
  id: number;
  confirmation: string;
};

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export function parseTestCycleDeletionRequest(
  value: unknown,
): { ok: true; value: TestCycleDeletionRequest } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Solicitud inválida" };
  }

  const payload = value as Record<string, unknown>;
  const id = positiveInteger(payload.id);
  if (!id) return { ok: false, error: "Ciclo inválido" };
  if (
    typeof payload.confirmation !== "string" ||
    !payload.confirmation ||
    payload.confirmation.length > 200
  ) {
    return { ok: false, error: "Debes escribir el nombre exacto del ciclo" };
  }

  return { ok: true, value: { id, confirmation: payload.confirmation } };
}

export function parseTestCycleId(
  value: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const id = value && typeof value === "object" && !Array.isArray(value)
    ? positiveInteger((value as Record<string, unknown>).id)
    : null;
  return id ? { ok: true, value: id } : { ok: false, error: "Ciclo inválido" };
}
