import { describe, expect, it, vi } from "vitest";
import {
  canManageCoordinatedTeacher,
  canObserveAssignedTeacher,
  getMyAssignedTeacherIds,
} from "./teacherAssignments";

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) } as any;
}

describe("teacher assignment RPC helpers", () => {
  it("uses separate read scopes and fails closed for an unavailable RPC", async () => {
    const coordinated = clientReturning([{ docente_id: 4 }]);
    const observation = clientReturning([{ docente_id: 8 }]);
    expect(await getMyAssignedTeacherIds(coordinated, "coordinated", 10)).toEqual(new Set([4]));
    expect(await getMyAssignedTeacherIds(observation, "observation", 10)).toEqual(new Set([8]));
    expect(coordinated.rpc).toHaveBeenCalledWith("my_coordinated_teacher_ids", { p_cuatrimestre_id: 10 });
    expect(observation.rpc).toHaveBeenCalledWith("my_observation_teacher_ids", { p_cuatrimestre_id: 10 });
    expect(await getMyAssignedTeacherIds(clientReturning(null, new Error("denied")), "observation", 10)).toEqual(new Set());
  });

  it("checks each purpose-specific permission function independently", async () => {
    const coordinated = clientReturning(true);
    const observation = clientReturning(false);
    expect(await canManageCoordinatedTeacher(coordinated, 4, 10)).toBe(true);
    expect(await canObserveAssignedTeacher(observation, 4, 10)).toBe(false);
    expect(coordinated.rpc).toHaveBeenCalledWith("can_manage_coordinated_teacher", { p_docente_id: 4, p_cuatrimestre_id: 10 });
    expect(observation.rpc).toHaveBeenCalledWith("can_observe_assigned_teacher", { p_docente_id: 4, p_cuatrimestre_id: 10 });
  });
});
