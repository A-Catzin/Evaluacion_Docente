export type StudentImportIdentityRow = {
  rowNumber: number;
  email: string;
  matricula: string;
};

export function normalizeStudentImportEmail(
  email: string | null | undefined,
): string {
  return (email || "").trim().toLowerCase();
}

function normalizeStudentImportMatricula(
  matricula: string | null | undefined,
): string {
  return (matricula || "").trim().toLowerCase();
}

export function findAmbiguousStudentImportRows(
  rows: StudentImportIdentityRow[],
): Set<number> {
  const matriculasByEmail = new Map<string, Set<string>>();

  for (const row of rows) {
    const email = normalizeStudentImportEmail(row.email);
    const matricula = normalizeStudentImportMatricula(row.matricula);
    const matriculas = matriculasByEmail.get(email);
    if (matriculas) matriculas.add(matricula);
    else matriculasByEmail.set(email, new Set([matricula]));
  }

  const ambiguousEmails = new Set<string>();
  for (const [email, matriculas] of matriculasByEmail) {
    if (matriculas.size > 1) ambiguousEmails.add(email);
  }

  const ambiguousRows = new Set<number>();
  for (const row of rows) {
    if (ambiguousEmails.has(normalizeStudentImportEmail(row.email)))
      ambiguousRows.add(row.rowNumber);
  }
  return ambiguousRows;
}
