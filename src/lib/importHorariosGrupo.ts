import { parseCsv } from "./importCsv";

export const HORARIOS_GRUPO_CSV_HEADERS = [
  "GRUPO_ID",
  "DIA_SEMANA",
  "HORA_INICIO",
  "HORA_FIN",
  "AULA",
] as const;

export type HorarioGrupoCsvRow = {
  row: number;
  grupoId: number;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  aula: string | null;
};

export type HorarioGrupoDiagnostic = {
  row: number;
  reason: string;
  details?: Record<string, unknown>;
};

export type HorarioGrupoImportAction = HorarioGrupoCsvRow & {
  kind: "create" | "no-op";
  groupLabel?: string;
};

function parseTime(value: string): string | null {
  const match = value.trim().match(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
  if (!match) return null;
  return value.trim().length === 5 ? `${value.trim()}:00` : value.trim();
}

function timeValue(value: string): number {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function headerContract(headers: string[]): HorarioGrupoDiagnostic | null {
  const normalized = headers.map((header) => header.trim().toUpperCase());
  const unique = new Set(normalized);
  if (
    normalized.length !== HORARIOS_GRUPO_CSV_HEADERS.length ||
    HORARIOS_GRUPO_CSV_HEADERS.some((header) => !unique.has(header)) ||
    unique.size !== normalized.length
  ) {
    return {
      row: 1,
      reason: "invalid_contract",
      details: { required: HORARIOS_GRUPO_CSV_HEADERS.join(",") },
    };
  }
  return null;
}

/** Parses the exact group-schedule CSV contract without reading or writing the database. */
export function parseHorariosGrupoCsv(text: string): {
  rows: HorarioGrupoCsvRow[];
  blockers: HorarioGrupoDiagnostic[];
} {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!records.length)
    return { rows: [], blockers: [{ row: 1, reason: "empty_file" }] };

  const contractError = headerContract(records[0]);
  if (contractError) return { rows: [], blockers: [contractError] };

  const headerIndex = new Map(
    records[0].map((header, index) => [header.trim().toUpperCase(), index]),
  );
  const rows: HorarioGrupoCsvRow[] = [];
  const blockers: HorarioGrupoDiagnostic[] = [];
  const seen = new Set<string>();

  for (const [offset, record] of records.slice(1).entries()) {
    const row = offset + 2;
    const value = (header: (typeof HORARIOS_GRUPO_CSV_HEADERS)[number]) =>
      (record[headerIndex.get(header) ?? -1] || "").trim();
    const grupoId = Number(value("GRUPO_ID"));
    const diaSemana = Number(value("DIA_SEMANA"));
    const horaInicio = parseTime(value("HORA_INICIO"));
    const horaFin = parseTime(value("HORA_FIN"));
    const aulaValue = value("AULA");
    const aula = aulaValue || null;
    const invalid: string[] = [];
    if (!Number.isSafeInteger(grupoId) || grupoId <= 0)
      invalid.push("GRUPO_ID");
    if (!Number.isSafeInteger(diaSemana) || diaSemana < 1 || diaSemana > 7)
      invalid.push("DIA_SEMANA");
    if (!horaInicio) invalid.push("HORA_INICIO");
    if (!horaFin) invalid.push("HORA_FIN");
    if (aulaValue.length > 120) invalid.push("AULA");
    if (horaInicio && horaFin && timeValue(horaInicio) >= timeValue(horaFin))
      invalid.push("RANGO_HORARIO");
    if (invalid.length) {
      blockers.push({ row, reason: "invalid_row", details: { invalid } });
      continue;
    }
    const schedule = {
      row,
      grupoId,
      diaSemana,
      horaInicio: horaInicio!,
      horaFin: horaFin!,
      aula,
    };
    const key = `${grupoId}|${diaSemana}|${horaInicio}|${horaFin}`;
    if (seen.has(key)) {
      blockers.push({
        row,
        reason: "duplicate_row",
        details: { first: "same active schedule" },
      });
      continue;
    }
    seen.add(key);
    rows.push(schedule);
  }
  if (!records.slice(1).length) blockers.push({ row: 1, reason: "empty_file" });
  return { rows, blockers };
}

export function planHorariosGrupoImport(input: {
  rows: HorarioGrupoCsvRow[];
  groups: Array<{
    id: number | string;
    cuatrimestre_id?: number | string | null;
    activo?: boolean | null;
    label?: string;
  }>;
  existing: Array<{
    grupo_id: number | string;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    aula: string | null;
    activo?: boolean | null;
  }>;
  cycleId: number;
}): {
  actions: HorarioGrupoImportAction[];
  blockers: HorarioGrupoDiagnostic[];
} {
  const blockers: HorarioGrupoDiagnostic[] = [];
  const actions: HorarioGrupoImportAction[] = [];
  for (const row of input.rows) {
    const matches = input.groups.filter(
      (group) =>
        Number(group.id) === row.grupoId &&
        Number(group.cuatrimestre_id) === input.cycleId &&
        group.activo !== false,
    );
    if (matches.length !== 1) {
      blockers.push({
        row: row.row,
        reason: "group_not_available",
        details: { grupoId: row.grupoId },
      });
      continue;
    }
    const duplicate = input.existing.some(
      (schedule) =>
        schedule.activo !== false &&
        Number(schedule.grupo_id) === row.grupoId &&
        Number(schedule.dia_semana) === row.diaSemana &&
        schedule.hora_inicio === row.horaInicio &&
        schedule.hora_fin === row.horaFin,
    );
    actions.push({
      ...row,
      kind: duplicate ? "no-op" : "create",
      groupLabel: matches[0].label,
    });
  }
  return { actions, blockers };
}

export function validateHorarioGrupoInput(
  value: unknown,
):
  | { ok: true; value: Omit<HorarioGrupoCsvRow, "row"> }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object")
    return { ok: false, error: "Invalid schedule payload" };
  const input = value as Record<string, unknown>;
  const grupoId = Number(input.grupo_id ?? input.grupoId);
  const diaSemana = Number(input.dia_semana ?? input.diaSemana);
  const horaInicio = parseTime(
    String(input.hora_inicio ?? input.horaInicio ?? ""),
  );
  const horaFin = parseTime(String(input.hora_fin ?? input.horaFin ?? ""));
  const aulaValue = String(input.aula ?? "").trim();
  const aula = aulaValue || null;
  if (
    !Number.isSafeInteger(grupoId) ||
    grupoId <= 0 ||
    !Number.isSafeInteger(diaSemana) ||
    diaSemana < 1 ||
    diaSemana > 7 ||
    !horaInicio ||
    !horaFin ||
    aulaValue.length > 120 ||
    timeValue(horaInicio) >= timeValue(horaFin)
  )
    return { ok: false, error: "Invalid schedule fields" };
  return { ok: true, value: { grupoId, diaSemana, horaInicio, horaFin, aula } };
}
