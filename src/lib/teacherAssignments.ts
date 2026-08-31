import type { SupabaseClient } from "@supabase/supabase-js";

type AssignmentPurpose = "coordinated" | "observation";

export async function getMyAssignedTeacherIds(
  client: SupabaseClient,
  purpose: AssignmentPurpose,
  cycleId: number,
): Promise<Set<number>> {
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return new Set();
  const functionName = purpose === "coordinated"
    ? "my_coordinated_teacher_ids"
    : "my_observation_teacher_ids";
  const { data, error } = await client.rpc(functionName, {
    p_cuatrimestre_id: cycleId,
  });
  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    data
      .map((row) => Number((row as { docente_id?: unknown }).docente_id))
      .filter(Number.isSafeInteger),
  );
}

export async function canManageCoordinatedTeacher(
  client: SupabaseClient,
  teacherId: number,
  cycleId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(teacherId) || !Number.isSafeInteger(cycleId)) return false;
  const { data, error } = await client.rpc("can_manage_coordinated_teacher", {
    p_docente_id: teacherId,
    p_cuatrimestre_id: cycleId,
  });
  return !error && data === true;
}

export async function canObserveAssignedTeacher(
  client: SupabaseClient,
  teacherId: number,
  cycleId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(teacherId) || !Number.isSafeInteger(cycleId)) return false;
  const { data, error } = await client.rpc("can_observe_assigned_teacher", {
    p_docente_id: teacherId,
    p_cuatrimestre_id: cycleId,
  });
  return !error && data === true;
}
