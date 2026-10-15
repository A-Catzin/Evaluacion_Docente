export type CoordinatorCycleCatalogItem = {
  id: unknown;
};

export type CoordinatorCycleResolutionInput = {
  query?: unknown;
  cookie?: unknown;
  active?: unknown;
  catalog?: readonly CoordinatorCycleCatalogItem[];
};

function toPositiveSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveCoordinatorCycle({
  query,
  cookie,
  active,
  catalog = [],
}: CoordinatorCycleResolutionInput): number {
  const catalogIds = catalog
    .map((cycle) => toPositiveSafeInteger(cycle.id))
    .filter((id): id is number => id !== null);
  const catalogIsAvailable = catalog.length > 0;
  const isValid = (value: unknown): number | null => {
    const id = toPositiveSafeInteger(value);
    return id !== null && (!catalogIsAvailable || catalogIds.includes(id))
      ? id
      : null;
  };

  return (
    isValid(query) ??
    isValid(cookie) ??
    isValid(active) ??
    catalogIds[0] ??
    0
  );
}
