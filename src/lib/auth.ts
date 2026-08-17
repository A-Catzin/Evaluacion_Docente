import type { APIContext } from "astro";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { crearClienteSuperbase } from "./supabaseClient";

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

  const { data: profile, error: profileError } = await client
    .from("usuarios")
    .select("id,rol,email")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError || !profile) {
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
