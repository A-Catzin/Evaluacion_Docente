export type PlanningSubjectAssignment = {
  asignaturaId: number;
  asignaturaNombre: string;
  grupo: string;
  modalidad?: string | null;
};

export type PlanningSubjectScope<
  T extends PlanningSubjectAssignment = PlanningSubjectAssignment,
> = {
  key: string;
  nombre: string;
  canonical: T;
  assignments: T[];
  grupos: string[];
};

export type PlanningSubjectRecord = {
  asignaturaNombre: string;
  estado?: string | null;
};

/**
 * Subject identity for planning is the human subject name, not its catalog ID.
 * It is intentionally accent-, case-, and whitespace-insensitive.
 */
export function normalizePlanningSubjectName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX");
}

export function groupPlanningAssignmentsBySubjectName<
  T extends PlanningSubjectAssignment,
>(assignments: readonly T[]): PlanningSubjectScope<T>[] {
  const scopes = new Map<string, PlanningSubjectScope<T>>();
  for (const assignment of assignments) {
    const key = normalizePlanningSubjectName(assignment.asignaturaNombre);
    if (!key) continue;
    const scope = scopes.get(key);
    if (scope) {
      scope.assignments.push(assignment);
      if (assignment.grupo) scope.grupos.push(assignment.grupo);
      continue;
    }
    scopes.set(key, {
      key,
      nombre: assignment.asignaturaNombre.trim(),
      canonical: assignment,
      assignments: [assignment],
      grupos: assignment.grupo ? [assignment.grupo] : [],
    });
  }

  return [...scopes.values()]
    .map((scope) => ({
      ...scope,
      assignments: [...scope.assignments].sort((left, right) =>
        `${left.grupo}:${left.asignaturaId}`.localeCompare(
          `${right.grupo}:${right.asignaturaId}`,
          "es-MX",
        ),
      ),
      grupos: [...new Set(scope.grupos)].sort((left, right) =>
        left.localeCompare(right, "es-MX"),
      ),
    }))
    .map((scope) => ({ ...scope, canonical: scope.assignments[0] }))
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es-MX"));
}

export function isPlanningSubjectBlocked(
  records: readonly PlanningSubjectRecord[],
  subjectName: string,
): boolean {
  const key = normalizePlanningSubjectName(subjectName);
  return records.some(
    (record) =>
      normalizePlanningSubjectName(record.asignaturaNombre) === key &&
      (record.estado === "Pendiente" || record.estado === "Aprobado"),
  );
}
