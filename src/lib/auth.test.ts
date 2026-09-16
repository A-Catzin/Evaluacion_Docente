import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  crearClienteSuperbase: vi.fn(),
  obtenerClienteAdmin: vi.fn(),
  sessionFrom: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  crearClienteSuperbase: mocks.crearClienteSuperbase,
  obtenerClienteAdmin: mocks.obtenerClienteAdmin,
}));

import {
  AuthError,
  DOMINIO_PERMITIDO,
  esCorreoTec,
  jsonAuthResponse,
  requireRole,
} from "./auth";

const sessionClient = {
  auth: { setSession: mocks.setSession },
  from: mocks.sessionFrom,
};
const adminClient = { from: mocks.adminFrom };
const sessionUser = {
  id: "user-123",
  email: "person@tecplayacar.edu.mx",
  app_metadata: { role: "docente" },
};

function profileQuery(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { query: { select }, select, eq, maybeSingle };
}

function cookies() {
  return {
    get: vi.fn((name: string) => {
      if (name === "sb-access-token") return { value: "access-token-secret" };
      if (name === "sb-refresh-token") return { value: "refresh-token-secret" };
      return undefined;
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.crearClienteSuperbase.mockReturnValue(sessionClient);
  mocks.obtenerClienteAdmin.mockReturnValue(adminClient);
  mocks.setSession.mockResolvedValue({ data: { user: sessionUser }, error: null });
});

describe("auth", () => {
  describe("esCorreoTec", () => {
    it("acepta correos del dominio permitido", () => {
      expect(esCorreoTec("usuario@tecplayacar.edu.mx")).toBe(true);
      expect(esCorreoTec("Usuario@TECPLAYACAR.EDU.MX")).toBe(true);
    });

    it("rechaza correos de otros dominios", () => {
      expect(esCorreoTec("usuario@gmail.com")).toBe(false);
      expect(esCorreoTec("usuario@tecplayacar.com")).toBe(false);
      expect(esCorreoTec("usuario@sub.tecplayacar.edu.mx")).toBe(false);
    });

    it("el dominio permitido tiene el formato esperado", () => {
      expect(DOMINIO_PERMITIDO).toBe("@tecplayacar.edu.mx");
    });
  });

  describe("jsonAuthResponse", () => {
    it("devuelve un Response JSON con el status y headers correctos", () => {
      const body = { error: "No autorizado", code: "session_invalid" };
      const response = jsonAuthResponse(body, 401);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("serializa correctamente el cuerpo", async () => {
      const body = { ok: true };
      const response = jsonAuthResponse(body, 200);
      expect(await response.json()).toEqual(body);
    });
  });

  describe("requireRole", () => {
    it("uses the service-role lookup by session user id when the session lookup errors", async () => {
      const sessionLookup = profileQuery({
        data: null,
        error: { code: "42501", message: "RLS denied" },
      });
      const adminLookup = profileQuery({
        data: { id: "user-123", rol: "superadmin", email: sessionUser.email },
        error: null,
      });
      mocks.sessionFrom.mockReturnValue(sessionLookup.query);
      mocks.adminFrom.mockReturnValue(adminLookup.query);

      const result = await requireRole(cookies(), ["superadmin"]);

      expect(mocks.adminFrom).toHaveBeenCalledWith("usuarios");
      expect(adminLookup.select).toHaveBeenCalledWith("id,rol,email");
      expect(adminLookup.eq).toHaveBeenCalledWith("id", sessionUser.id);
      expect(result.profile.rol).toBe("superadmin");
      expect(result.client).toBe(sessionClient);
    });

    it("keeps authorization role DB-derived rather than trusting session claims", async () => {
      const sessionLookup = profileQuery({
        data: { id: "user-123", rol: "docente", email: sessionUser.email },
        error: null,
      });
      mocks.sessionFrom.mockReturnValue(sessionLookup.query);

      await expect(requireRole(cookies(), ["superadmin"])).rejects.toMatchObject({
        response: expect.objectContaining({ status: 403 }),
      } satisfies Partial<AuthError>);
      expect(mocks.adminFrom).not.toHaveBeenCalled();
    });

    it("logs bounded, redacted lookup diagnostics and retains profile_lookup_failed", async () => {
      const sessionLookup = profileQuery({ data: null, error: null });
      const adminLookup = profileQuery({
        data: null,
        error: {
          code: "PGRST001",
          status: 503,
          message: "user person@tecplayacar.edu.mx access_token=access-token-secret cookie=session-cookie",
        },
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mocks.sessionFrom.mockReturnValue(sessionLookup.query);
      mocks.adminFrom.mockReturnValue(adminLookup.query);

      await expect(requireRole(cookies(), ["superadmin"])).rejects.toMatchObject({
        response: expect.objectContaining({ status: 502 }),
      } satisfies Partial<AuthError>);

      expect(warn).toHaveBeenCalledWith(
        "[auth] profile lookup failed",
        expect.objectContaining({
          userId: sessionUser.id,
          anonProfileFound: false,
          anonProfileResult: "no_row",
          fallbackAttempted: true,
          fallbackProfileFound: false,
          fallbackProfileResult: "database_error",
          fallbackErrorCode: "PGRST001",
          fallbackErrorStatus: 503,
        }),
      );
      const diagnostics = JSON.stringify(warn.mock.calls[0][1]);
      expect(diagnostics).not.toContain(sessionUser.email);
      expect(diagnostics).not.toContain("access-token-secret");
      expect(diagnostics).not.toContain("session-cookie");
      expect(diagnostics).toContain("[redacted-token]");
      expect(diagnostics).toContain("[redacted-cookie]");
      warn.mockRestore();
    });

    it("keeps credential values out of the profile-failure logging contract", () => {
      const source = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
      const logStart = source.indexOf('console.warn("[auth] profile lookup failed"');
      const logBlock = source.slice(
        logStart,
        source.indexOf("throw new AuthError", logStart),
      );

      expect(logBlock).toContain("userId: session.user.id");
      expect(logBlock).toContain("anonProfileResult");
      expect(logBlock).toContain("fallbackProfileResult");
      expect(logBlock).not.toContain("accessToken");
      expect(logBlock).not.toContain("refreshToken");
      expect(logBlock).not.toContain("email");
    });
  });
});
