import type { APIContext } from "astro";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { crearClienteSuperbase, obtenerClienteAdmin } from "./supabaseClient";

export const DOMINIO_PERMITIDO = "@tecplayacar.edu.mx";

export function esCorreoTec(email: string): boolean {
  return email.toLowerCase().endsWith(DOMINIO_PERMITIDO);
}

export type AuthProfile = {
  id: string;
  rol: string;
  email: string;
};

export type AuthResult = {
  user: User;
  profile: AuthProfile;
  client: SupabaseClient;
};

export class AuthError extends Error {
  constructor(public readonly response: Response) {
    super("AuthError");
  }
}

export function jsonAuthResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function boundedProfileLookupDiagnostic(value: unknown): string | number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  return value
    .slice(0, 240)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:access|refresh)?[_-]?token\b\s*[:=]?\s*\S+/gi, "[redacted-token]")
    .replace(/\bcookie\b\s*[:=]?\s*\S+/gi, "[redacted-cookie]");
}

function profileLookupErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: null, status: null, message: null };
  }

  const details = error as Record<string, unknown>;
  return {
    code: boundedProfileLookupDiagnostic(details.code),
    status: boundedProfileLookupDiagnostic(details.status),
    message: boundedProfileLookupDiagnostic(details.message),
  };
}

export async function requireRole(
  cookies: APIContext["cookies"],
  allowedRoles: string[],
  options: { requireTecDomain?: boolean } = {},
): Promise<AuthResult> {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;

  if (!accessToken || !refreshToken) {
    throw new AuthError(
      jsonAuthResponse(
        { error: "No autorizado", code: "session_invalid" },
        401,
      ),
    );
  }

  const client = crearClienteSuperbase();
  const { data: session, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !session.user?.email) {
    throw new AuthError(
      jsonAuthResponse(
        { error: "Sesión no válida", code: "session_invalid" },
        401,
      ),
    );
  }

  const email = session.user.email.toLowerCase();
  if (options.requireTecDomain !== false && !esCorreoTec(email)) {
    throw new AuthError(
      jsonAuthResponse(
        { error: "Correo no autorizado", code: "unauthorized_domain" },
        403,
      ),
    );
  }

  let sessionProfile: AuthProfile | null = null;
  let sessionProfileError: unknown = null;
  try {
    const result = await client
      .from("usuarios")
      .select("id,rol,email")
      .eq("id", session.user.id)
      .maybeSingle();
    sessionProfile = result.data;
    sessionProfileError = result.error;
  } catch (error) {
    sessionProfileError = error;
  }

  let profile = sessionProfileError ? null : sessionProfile;
  let fallbackProfile: AuthProfile | null = null;
  let fallbackError: unknown = null;
  const fallbackAttempted = Boolean(sessionProfileError || !sessionProfile);

  if (fallbackAttempted) {
    try {
      const result = await obtenerClienteAdmin()
        .from("usuarios")
        .select("id,rol,email")
        .eq("id", session.user.id)
        .maybeSingle();
      fallbackProfile = result.data;
      fallbackError = result.error;
      profile = result.error ? null : result.data;
    } catch (error) {
      fallbackError = error;
    }
  }

  if (!profile) {
    const fallbackErrorDetails = profileLookupErrorDetails(fallbackError);
    console.warn("[auth] profile lookup failed", {
      userId: session.user.id,
      anonProfileFound: Boolean(sessionProfile),
      anonProfileResult: sessionProfileError
        ? "database_error"
        : sessionProfile
          ? "found"
          : "no_row",
      fallbackAttempted,
      fallbackProfileFound: Boolean(fallbackProfile),
      fallbackProfileResult: fallbackError
        ? "database_error"
        : fallbackProfile
          ? "found"
          : "no_row",
      fallbackErrorCode: fallbackErrorDetails.code,
      fallbackErrorStatus: fallbackErrorDetails.status,
      fallbackErrorMessage: fallbackErrorDetails.message,
    });
    throw new AuthError(
      jsonAuthResponse(
        {
          error: "No se pudo verificar el acceso",
          code: "profile_lookup_failed",
        },
        502,
      ),
    );
  }

  if (!allowedRoles.includes(profile.rol)) {
    throw new AuthError(
      jsonAuthResponse(
        {
          error: "No tienes permiso para realizar esta acción",
          code: "forbidden",
        },
        403,
      ),
    );
  }

  return { user: session.user, profile, client };
}
