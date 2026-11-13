/** Layout of the Academia spreadsheet: current cycle block, manual action-plan column and, when there is one, the previous cycle block. */

export type ScoreRow = {
  score_encuesta_estudiantil: number | null;
  score_coordinacion: number | null;
  score_planeacion: number | null;
  score_observacion: number | null;
  score_autoevaluacion: number | null;
  calificacion_final: number | null;
  categoria_final: string | null;
  instrument_validity?: Record<string, string> | null;
};

/** Next cycle label, e.g. 27-1 -> 27-2 and 26-3 -> 27-1. Returns "" when the key does not follow YY-N. */
export function nextCycleLabel(clave: string): string {
  const match = /^(\d{2})-(\d)$/.exec(clave.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const term = Number(match[2]);
  return term >= 3 ? `${String(year + 1).padStart(2, "0")}-1` : `${match[1]}-${term + 1}`;
}

/** Group shift: the stored value first, otherwise derived from the first class hour (before 14:00 is morning). */
export function deriveShift(stored: string | null, startTimes: string[]): string {
  if (stored && stored.trim()) return stored.trim();
  const periods = new Set(
    startTimes
      .map((time) => Number.parseInt(time.slice(0, 2), 10))
      .filter(Number.isFinite)
      .map((hour) => (hour < 14 ? "Matutino" : "Vespertino")),
  );
  return [...periods].sort().join(" / ");
}

export function format360Headers(currentClave: string, previousClave: string | null = null): string[] {
  const next = nextCycleLabel(currentClave);
  const current = [
    "Nombre docente",
    "Marque la (s) oferta académica en la cual participe con su práctica Docente",
    "Turno",
    "Categoria Docente 360°",
    `Final 360°- ciclo ${currentClave}`,
    "Promedio Estudiantil (3.5)",
    "Promedio OBS CLASE (2.5)",
    "Promedio COORD-ACA (2)",
    "Promedio Plane/ Doce (1.5)",
    "Promedio Auto Dx (.5)",
    "Coordinador",
    "Nombre Coordinador",
    `PLAN ACCIÓN ACADEMIA ${next}`.trim(),
  ];
  if (!previousClave) return current;
  return [
    ...current,
    "Categoria Docente 360°",
    `Final 360°- ciclo ${previousClave}`.trim(),
    "Promedio OBS CLASE (2.5)",
    "Promedio Estudiantil (3.5)",
    "Promedio COORD-ACA (2)",
    "Promedio Plane/ Doce (1.5)",
    "Promedio Auto Dx (.5)",
    "Puntos Totales AuDx",
    "PLAN ACCIÓN ACADEMIA",
  ];
}

type Cell = string | number | "";

const score = (value: number | null | undefined): Cell =>
  value == null || !Number.isFinite(Number(value)) ? "" : Math.round(Number(value) * 100) / 100;

function planning(row: ScoreRow | undefined): Cell {
  if (!row) return "";
  return row.score_planeacion == null ? "NP" : score(row.score_planeacion);
}

function selfAssessment(row: ScoreRow | undefined): Cell {
  if (!row) return "";
  return row.instrument_validity?.autodiagnostico === "not_done" ? "No realizado" : score(row.score_autoevaluacion);
}

export type Format360Teacher = {
  name: string;
  offers: string;
  shift: string;
  coordinatorEmail: string;
  coordinatorName: string;
  current?: ScoreRow;
  previous?: ScoreRow;
  previousAutoPoints?: number | null;
};

export function format360Row(teacher: Format360Teacher, includePrevious = true): Cell[] {
  const { current, previous } = teacher;
  const currentBlock: Cell[] = [
    teacher.name,
    teacher.offers,
    teacher.shift,
    current ? (current.categoria_final ?? "No iniciado") : "No iniciado",
    score(current?.calificacion_final),
    score(current?.score_encuesta_estudiantil),
    score(current?.score_observacion),
    score(current?.score_coordinacion),
    planning(current),
    selfAssessment(current),
    teacher.coordinatorEmail,
    teacher.coordinatorName,
    "",
  ];
  if (!includePrevious) return currentBlock;
  return [
    ...currentBlock,
    previous ? (previous.categoria_final ?? "") : "",
    score(previous?.calificacion_final),
    score(previous?.score_observacion),
    score(previous?.score_encuesta_estudiantil),
    score(previous?.score_coordinacion),
    planning(previous),
    selfAssessment(previous),
    score(teacher.previousAutoPoints),
    "",
  ];
}
