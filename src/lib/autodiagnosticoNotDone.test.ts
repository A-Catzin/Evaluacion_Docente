import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAutodiagnosticoClosedForCycle } from "./autodiagnosticoSubmissionWindow";
import { calcFinalScore } from "../services/scoring";

const clientWith = (data: unknown, error: { message: string } | null = null) =>
  ({ rpc: (fn: string, args: unknown) => (calls.push([fn, args]), Promise.resolve({ data, error })) }) as unknown as SupabaseClient;
const calls: Array<[string, unknown]> = [];

describe("autodiagnóstico closed window", () => {
  it("asks the database function for the cycle and is true only when it answers true", async () => {
    expect(await isAutodiagnosticoClosedForCycle(clientWith(true), 11)).toBe(true);
    expect(calls.at(-1)).toEqual(["autodiagnostico_cycle_window_closed", { p_cuatrimestre_id: 11 }]);
    expect(await isAutodiagnosticoClosedForCycle(clientWith(false), 11)).toBe(false);
    expect(await isAutodiagnosticoClosedForCycle(clientWith(null), 11)).toBe(false);
  });

  it("does not break the calculation when the lookup fails or the cycle is invalid", async () => {
    expect(await isAutodiagnosticoClosedForCycle(clientWith(null, { message: "boom" }), 11)).toBe(false);
    expect(await isAutodiagnosticoClosedForCycle(clientWith(true), 0)).toBe(false);
  });
});

describe("autodiagnóstico not done counts as 0", () => {
  it("completes the instrument so the teacher gets a category instead of Parcial", () => {
    const scores = { ee: 90, coord: 100, obs: 100, plan: 80 };
    expect(calcFinalScore(scores).category).toBe("Parcial");
    const closed = calcFinalScore({ ...scores, auto: 0 });
    expect(closed.instrumentCount).toBe(5);
    expect(closed.category).not.toBe("Parcial");
    expect(closed.final).toBe(calcFinalScore({ ...scores, auto: 100 }).final - 5);
  });
});

describe("migration 122", () => {
  it("exposes only a boolean to signed-in sessions and the service role", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/122_autodiagnostico_cycle_window_closed.sql", "utf8");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.autodiagnostico_cycle_window_closed\(INTEGER\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.autodiagnostico_cycle_window_closed\(INTEGER\) TO authenticated, service_role/);
  });
});

describe("autodiagnóstico not done only penalises teachers who were expected to do it", () => {
  const tables: Record<string, unknown[]> = {
    grupos: [{ docente_id: 1 }, { docente_id: 2 }],
    docentes: [{ id: 1 }, { id: 3 }],
  };
  const chain = (rows: unknown[]) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "not", "is", "gt"]) query[method] = () => query;
    query.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
    return query;
  };
  const client = {
    from: (table: string) => chain(tables[table] ?? []),
    rpc: (fn: string) => Promise.resolve({ data: fn === "autodiagnostico_cycle_window_closed" ? true : [], error: null }),
  } as unknown as SupabaseClient;

  it("gives 0 + the flag to an active teacher with groups, and nothing to inactive or group-less ones", async () => {
    const { fetchBatchScoresPorDocente } = await import("../services/scoring");
    const result = await fetchBatchScoresPorDocente(client, [1, 2, 3], 11);
    expect(result.get(1)).toMatchObject({ auto: 0, autoNotDone: true });
    // 2 has a group but is inactive; 3 is active but has no group.
    expect(result.get(2)?.auto).toBeUndefined();
    expect(result.get(2)?.autoNotDone).toBeUndefined();
    expect(result.get(3)?.auto).toBeUndefined();
    expect(result.get(3)?.autoNotDone).toBeUndefined();
  });
});
