import { beforeEach, describe, expect, it, vi } from "vitest";

const recalc = vi.fn();
const refresh = vi.fn();
const requireRole = vi.fn();
const rows: Record<string, { docente_id: number | null }[]> = {};

vi.mock("../services/calificaciones", () => ({
  recalcularCalificacionDocente: (...args: unknown[]) => recalc(...args),
  refrescarResultadosAgregados: (...args: unknown[]) => refresh(...args),
  logRecalcError: vi.fn(),
}));
vi.mock("../lib/auth", () => {
  class AuthError extends Error {
    constructor(public readonly response: Response) {
      super("AuthError");
    }
  }
  return { AuthError, requireRole: (...args: unknown[]) => requireRole(...args) };
});
vi.mock("../lib/db", () => ({
  dbAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: rows[table] || [], error: null }),
      };
      return query;
    },
  }),
}));

const { POST, RECALC_BATCH_SIZE } = await import("../pages/api/admin/recalcular-calificaciones");
const { AuthError } = await import("./auth");

const call = (body: unknown) =>
  POST({
    cookies: {},
    request: new Request("http://x/api/admin/recalcular-calificaciones", { method: "POST", body: JSON.stringify(body) }),
  } as never) as Promise<Response>;

describe("POST /api/admin/recalcular-calificaciones", () => {
  beforeEach(() => {
    recalc.mockReset().mockResolvedValue({});
    refresh.mockReset().mockResolvedValue(undefined);
    requireRole.mockReset().mockResolvedValue({ client: "user-client" });
    rows.calificaciones_finales = Array.from({ length: 10 }, (_, i) => ({ docente_id: i + 1 }));
    rows.instrument_submissions = [{ docente_id: 3 }, { docente_id: 42 }, { docente_id: null }];
  });

  it("only lets superadmins run it", async () => {
    requireRole.mockRejectedValue(new AuthError(new Response("no", { status: 403 })));
    const res = await call({ cuatrimestre: 11, offset: 0 });
    expect(res.status).toBe(403);
    expect(requireRole.mock.calls[0][1]).toEqual(["superadmin"]);
    expect(recalc).not.toHaveBeenCalled();
  });

  it("rejects invalid parameters without recalculating", async () => {
    const res = await call({ cuatrimestre: "x", offset: -1 });
    expect(res.status).toBe(400);
    expect(recalc).not.toHaveBeenCalled();
  });

  it("recalculates one batch of unique teachers with the user session and refreshes only at the end", async () => {
    const first = await (await call({ cuatrimestre: 11, offset: 0 })).json();
    expect(first).toEqual({ total: 11, processed: RECALC_BATCH_SIZE, failed: [], nextOffset: RECALC_BATCH_SIZE, done: false });
    expect(recalc.mock.calls.map((c) => c[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(recalc.mock.calls[0][0]).toBe("user-client");
    expect(recalc.mock.calls[0][2]).toBe(11);
    expect(refresh).not.toHaveBeenCalled();

    recalc.mockClear();
    recalc.mockImplementation(async (_c: unknown, id: number) => {
      if (id === 42) throw new Error("boom");
    });
    const last = await (await call({ cuatrimestre: 11, offset: first.nextOffset })).json();
    expect(recalc.mock.calls.map((c) => c[1])).toEqual([9, 10, 42]);
    expect(last).toEqual({ total: 11, processed: 3, failed: [42], nextOffset: 11, done: true });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
