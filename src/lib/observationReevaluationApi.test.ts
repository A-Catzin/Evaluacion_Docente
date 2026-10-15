import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireRole: vi.fn(),
  dbAdmin: vi.fn(() => ({ serviceRole: true })),
  recalc: vi.fn(),
  logRecalcError: vi.fn(),
  window: vi.fn(),
}));
vi.mock("./auth", () => ({
  AuthError: class AuthError extends Error {
    constructor(public response: Response) { super("AuthError"); }
  },
  requireRole: mocks.requireRole,
}));
vi.mock("./db", () => ({ dbAdmin: mocks.dbAdmin }));
vi.mock("../services/calificaciones", () => ({
  recalcularCalificacionDocente: mocks.recalc,
  logRecalcError: mocks.logRecalcError,
}));
vi.mock("./instrumentSubmissionWindow", () => ({
  getInstrumentSubmissionWindow: mocks.window,
  instrumentSubmissionMessage: () => "Ventana cerrada",
}));

import { AuthError } from "./auth";
import { ObservationReevaluationSchema } from "./validation/apiSchemas";
import { POST } from "../pages/api/instrumentos/reevaluacion";
import { GET, PUT, DELETE } from "../pages/api/instrumentos/revision-draft";

const version_id = "00000000-0000-4000-8000-000000000001";
const item_id = "00000000-0000-4000-8000-000000000002";
const section_id = "00000000-0000-4000-8000-000000000003";
const supersedes_submission_id = "00000000-0000-4000-8000-000000000004";
const operation_id = "00000000-0000-4000-8000-000000000005";
const identity = { docente_id: 7, cuatrimestre_id: 11, version_id };
const operation = { ...identity, supersedes_submission_id, operation_id };
const submission = {
  ...operation, asignatura_id: 8, grupo: "A",
  answers: [{ item_id, value: 3 }],
  evidence: [{ section_id, evidence: "Evidencia" }],
  metadata: { strengths: "Fortaleza" },
};
const draft = { asignatura_id: 8, grupo: "A", answers: [{ item_id, value: 3 }], evidence: [], metadata: {} };

function context(method: string, body?: unknown, query = "") {
  return {
    request: new Request(`http://localhost/api/instrumentos/revision-draft${query}`, {
      method,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }),
    cookies: {},
  } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ client: { rpc: mocks.rpc }, profile: { rol: "superadmin" } });
  mocks.window.mockResolvedValue({ state: "open" });
  mocks.rpc.mockResolvedValue({ data: { id: "receipt" }, error: null });
});

describe("four-observation revision API", () => {
  it("strictly validates new submissions, including numeric N/A conflicts and extras", () => {
    expect(ObservationReevaluationSchema.safeParse(submission).success).toBe(true);
    for (const changed of [
      { checks: [] }, { source_record_id: 1 }, { instrument_code: "observation_simulation" },
      { grupo: " " }, { asignatura_id: null },
      { answers: [{ item_id, value: 4 }] },
      { answers: [{ item_id, value: 3, na_reason: "motivo" }] },
      { answers: [{ item_id, value: "na" }] },
      { metadata: { strengths: "ok", untrusted: "x" } },
    ]) {
      expect(ObservationReevaluationSchema.safeParse({ ...submission, ...changed }).success).toBe(false);
    }
    expect(ObservationReevaluationSchema.safeParse({ ...submission, answers: [{ item_id, value: "na", na_reason: "razón" }] }).success).toBe(true);
  });

  it("uses actor-scoped RPC with exact stable operation payload, retries recalc via admin, and retains superadmin", async () => {
      const first = await POST(context("POST", submission));
      // The RPC returns the same committed receipt for an exact replay, even after closure.
      mocks.window.mockResolvedValue({ state: "closed" });
      const second = await POST(context("POST", submission));
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await second.json()).toEqual(await first.json());
      expect(mocks.requireRole).toHaveBeenCalledWith({}, ["superadmin", "coordinador", "observador"]);
      expect(mocks.window).not.toHaveBeenCalled();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith("reevaluate_observation_instrument", {
      p_version_id: version_id, p_docente_id: 7, p_cuatrimestre_id: 11,
      p_asignatura_id: 8, p_grupo: "A", p_supersedes_submission_id: supersedes_submission_id,
      p_operation_id: operation_id, p_answers: submission.answers, p_evidence: submission.evidence,
      p_metadata: submission.metadata,
    });
    expect(mocks.recalc).toHaveBeenCalledTimes(2);
    expect(mocks.recalc).toHaveBeenCalledWith({ serviceRole: true }, 7, 11);
  });

    it("fails closed on auth, bounds body, rejects moderated text and extra fields before RPC", async () => {
      mocks.requireRole.mockRejectedValueOnce(new AuthError(new Response("no", { status: 403 })));
      expect((await POST(context("POST", submission))).status).toBe(403);

    for (const body of [
      { ...submission, checks: [] },
      { ...submission, answers: [{ item_id, value: 3, na_reason: "no" }] },
      { ...submission, evidence: [{ section_id, evidence: "x".repeat(1001) }] },
      { ...submission, evidence: [{ section_id, evidence: "idiota" }] },
      { ...submission, answers: [{ item_id, value: "na", na_reason: "idiota" }] },
      { ...submission, metadata: { recommendation: "idiota" } },
      "x".repeat(200_001),
    ]) expect((await POST(context("POST", body))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

    it("delegates closed-window new-write denial to the RPC and maps SQL 42501 to 403", async () => {
      mocks.window.mockResolvedValue({ state: "closed" });
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "window closed" } });
      const response = await POST(context("POST", submission));
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.window).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(mocks.recalc).not.toHaveBeenCalled();
    });

    it("maps errors without disclosing someone else's receipt and logs failed recalc after committed RPC", async () => {
    for (const [code, status] of [["23505", 409], ["42501", 403], ["22023", 400]] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: { id: "foreign" }, error: { code, message: "sensitive receipt" } });
      const response = await POST(context("POST", submission));
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("foreign");
    }
    mocks.recalc.mockRejectedValueOnce(new Error("failure"));
    expect((await POST(context("POST", submission))).status).toBe(201);
    expect(mocks.logRecalcError).toHaveBeenCalledWith(7, 11, expect.any(Error));
  });

  it("GET returns only RPC state and no-store; PUT and DELETE send exact revision identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { head: { id: supersedes_submission_id }, revision_draft: null }, error: null });
    const get = await GET(context("GET", undefined, `?docente_id=7&cuatrimestre_id=11&version_id=${version_id}`));
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect(await get.json()).toEqual({ state: { head: { id: supersedes_submission_id }, revision_draft: null } });
    expect(mocks.rpc).toHaveBeenCalledWith("get_observation_revision_state", {
      p_docente_id: 7, p_cuatrimestre_id: 11, p_version_id: version_id,
    });
    const put = await PUT(context("PUT", { ...operation, draft }));
    expect(put.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("save_observation_revision_draft", {
      p_docente_id: 7, p_cuatrimestre_id: 11, p_version_id: version_id,
      p_supersedes_submission_id: supersedes_submission_id, p_operation_id: operation_id,
      p_draft: draft,
    });
    expect((await DELETE(context("DELETE", operation))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_observation_revision_draft", {
      p_docente_id: 7, p_cuatrimestre_id: 11, p_version_id: version_id,
      p_supersedes_submission_id: supersedes_submission_id, p_operation_id: operation_id,
    });
  });

  it("rejects invalid draft operations, oversized bodies and query extras; maps stale/forbidden RPCs", async () => {
    expect((await GET(context("GET", undefined, `?docente_id=7&cuatrimestre_id=11&version_id=${version_id}&actor=x`))).status).toBe(400);
    expect((await GET(context("GET", undefined, `?docente_id=7&docente_id=8&cuatrimestre_id=11&version_id=${version_id}`))).status).toBe(400);
    expect((await GET(context("GET", undefined, `?docente_id=7e0&cuatrimestre_id=11&version_id=${version_id}`))).status).toBe(400);
    for (const body of [
      { ...operation, draft: { ...draft, checks: [] } },
      { ...operation, draft: { ...draft, answers: [{ item_id, value: 2, na_reason: "bad" }] } },
      { ...operation, draft: { ...draft, metadata: { strengths: "x".repeat(2001) } } },
      { ...operation, draft: { ...draft, evidence: [{ section_id, evidence: "x".repeat(1001) }] } },
      { ...operation, draft: { ...draft, metadata: { strengths: "idiota" } } },
      { ...operation, draft: { ...draft, answers: [{ item_id, value: "na", na_reason: "idiota" }] } },
      { ...operation, draft, actor: "forged" },
      "x".repeat(100_001),
    ]) expect((await PUT(context("PUT", body))).status).toBe(400);
    expect((await DELETE(context("DELETE", { ...operation, actor: "forged" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "conflict" } });
    expect((await PUT(context("PUT", { ...operation, draft }))).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ data: { draft: "other actor" }, error: { code: "42501", message: "forbidden" } });
    const denied = await GET(context("GET", undefined, `?docente_id=7&cuatrimestre_id=11&version_id=${version_id}`));
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("other actor");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    expect((await DELETE(context("DELETE", operation))).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ data: { completed: true }, error: null });
    expect(await (await PUT(context("PUT", { ...operation, draft }))).json()).toMatchObject({
      success: true, completed: true,
    });
  });

  it("does not call an RPC for unauthenticated requests to any revision endpoint", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError(new Response("no", { status: 401 })));
    expect((await POST(context("POST", submission))).status).toBe(401);
    expect((await GET(context("GET", undefined, `?docente_id=7&cuatrimestre_id=11&version_id=${version_id}`))).status).toBe(401);
    expect((await PUT(context("PUT", { ...operation, draft }))).status).toBe(401);
    expect((await DELETE(context("DELETE", operation))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
