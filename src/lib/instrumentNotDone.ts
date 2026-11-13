import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetchAllRows";
import { effectiveWindowState, type InstrumentWindowRow } from "./instrumentWindowState";
import type { InstrumentSubmissionState } from "./instrumentSubmissionWindow";

/** Instruments whose capture window closes: a missing capture after the close scores 0. */
export type NotDonePurpose = "coordination" | "observation" | "student_survey";

export type ClosedInstruments = Record<NotDonePurpose, boolean>;

const PURPOSES: NotDonePurpose[] = ["coordination", "observation", "student_survey"];

const ASSIGNMENT_TABLE = {
  coordination: "coordinated_teacher_assignments",
  observation: "observation_teacher_assignments",
} as const;

/**
 * A window counts as closed once its schedule ended. A manually closed window
 * only counts when the instrument was actually used in the cycle, so a window
 * that was never opened does not zero everyone before the capture starts.
 */
export function isInstrumentClosed(
  window: { state: InstrumentSubmissionState },
  hasSubmissions: boolean,
): boolean {
  if (window.state === "scheduled_ended") return true;
  return window.state === "closed" && hasSubmissions;
}

/**
 * Window rows are not readable by user sessions, so a failed read falls back to
 * the service client. Scoring runs from the daily cron and from user sessions.
 */
export async function readCycleWindows(
  cl: SupabaseClient,
  cuatrimestreId: number,
): Promise<InstrumentWindowRow[]> {
  const read = (client: SupabaseClient) =>
    client
      .from("instrument_submission_windows")
      .select("purpose,mode,opens_at,closes_at")
      .eq("cuatrimestre_id", cuatrimestreId);
  try {
    const first = await read(cl);
    if (!first.error) return (first.data || []) as InstrumentWindowRow[];
    const { dbAdmin } = await import("./db");
    const second = await read(dbAdmin());
    return second.error ? [] : ((second.data || []) as InstrumentWindowRow[]);
  } catch {
    return [];
  }
}

async function hasSubmissions(
  cl: SupabaseClient,
  purpose: NotDonePurpose,
  cuatrimestreId: number,
): Promise<boolean> {
  const query =
    purpose === "student_survey"
      ? cl.from("encuesta_control_envio").select("id", { count: "exact", head: true }).eq("cuatrimestre_id", cuatrimestreId)
      : cl
          .from("instrument_submissions")
          .select("id", { count: "exact", head: true })
          .eq("cuatrimestre_id", cuatrimestreId)
          .eq("purpose", purpose);
  const { count } = await query;
  return (count ?? 0) > 0;
}

export async function loadClosedInstruments(
  cl: SupabaseClient,
  cuatrimestreId: number,
  now: Date = new Date(),
): Promise<ClosedInstruments> {
  const result: ClosedInstruments = { coordination: false, observation: false, student_survey: false };
  const windows = await readCycleWindows(cl, cuatrimestreId);
  for (const purpose of PURPOSES) {
    const row = windows.find((item) => item.purpose === purpose);
    const state = effectiveWindowState(row, now);
    if (state === "scheduled_ended") result[purpose] = true;
    else if (state === "closed") {
      result[purpose] = isInstrumentClosed({ state }, await hasSubmissions(cl, purpose, cuatrimestreId));
    }
  }
  return result;
}

/** Teachers with an active assignment for the instrument in the cycle (the ones expected to be evaluated). */
export async function teachersWithAssignment(
  cl: SupabaseClient,
  purpose: "coordination" | "observation",
  docenteIds: number[],
  cuatrimestreId: number,
): Promise<Set<number>> {
  const found = new Set<number>();
  for (let start = 0; start < docenteIds.length; start += 100) {
    const { data, error } = await cl
      .from(ASSIGNMENT_TABLE[purpose])
      .select("docente_id")
      .eq("cuatrimestre_id", cuatrimestreId)
      .is("revoked_at", null)
      .in("docente_id", docenteIds.slice(start, start + 100));
    if (error) throw new Error(`Error al leer asignaciones de ${purpose}: ${error.message}`);
    for (const row of (data || []) as { docente_id: number | null }[]) {
      if (row.docente_id != null) found.add(row.docente_id);
    }
  }
  return found;
}

/** Active enrollments of active students in active groups with the survey enabled, per teacher. */
export async function eligibleEnrollmentsByTeacher(
  cl: SupabaseClient,
  docenteIds: number[],
  cuatrimestreId: number,
): Promise<Map<number, number>> {
  const groupTeacher = new Map<number, number>();
  for (let start = 0; start < docenteIds.length; start += 100) {
    const { data, error } = await cl
      .from("grupos")
      .select("id,docente_id")
      .eq("cuatrimestre_id", cuatrimestreId)
      .eq("activo", true)
      .eq("encuesta_estudiantil_habilitada", true)
      .in("docente_id", docenteIds.slice(start, start + 100));
    if (error) throw new Error(`Error al leer grupos: ${error.message}`);
    for (const row of (data || []) as { id: number; docente_id: number }[]) groupTeacher.set(row.id, row.docente_id);
  }
  const counts = new Map<number, number>();
  const groupIds = [...groupTeacher.keys()];
  for (let start = 0; start < groupIds.length; start += 50) {
    const chunk = groupIds.slice(start, start + 50);
    const { data, error } = await fetchAllRows<{ grupo_id: number }>(async (from, to) =>
      cl
        .from("inscripciones")
        .select("grupo_id, estudiantes!inner(activo)")
        .eq("cuatrimestre_id", cuatrimestreId)
        .eq("estudiantes.activo", true)
        .in("grupo_id", chunk)
        .order("id")
        .range(from, to),
    );
    if (error) throw new Error(`Error al leer inscripciones: ${error.message}`);
    for (const row of data || []) {
      const docenteId = groupTeacher.get(row.grupo_id);
      if (docenteId != null) counts.set(docenteId, (counts.get(docenteId) ?? 0) + 1);
    }
  }
  return counts;
}
