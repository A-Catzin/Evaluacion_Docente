import { defineMiddleware } from "astro:middleware";
import { crearClienteSuperbase } from "./lib/supabaseClient";
import { obtenerRolUsuario } from "./lib/db";
import { esCorreoTec } from "./lib/auth";

const RUTAS_PUBLICAS = [
  "/api/auth/guardar-sesion",
  "/api/auth/signout",
  "/api/auth/rol",
  "/api/auth/callback",
  "/api/docente/autodiagnostico",
  "/api/coordinador/observacion",
  "/api/coordinador/planeacion",
  "/api/coordinador/evaluacion-coordinacion",
  "/api/auth/solicitar-acceso",
  "/pendiente",
  "/auth",
  "/",
  "/favicon.ico",
  "/favicon.svg",
];

const ROLES_POR_RUTA: Record<string, string[]> = {
  "/admin": ["superadmin"],
  "/coordinador/reportes": ["coordinador", "superadmin"],
  "/coordinador/planeaciones": ["coordinador", "superadmin"],
  "/coordinador": ["coordinador", "superadmin", "observador"],
  "/docente/dashboard": ["docente", "pendiente", "superadmin", "coordinador"],
  "/docente/autodiagnostico": [
    "docente",
    "pendiente",
    "superadmin",
    "coordinador",
  ],
  "/docente": ["docente", "superadmin", "coordinador"],
  "/estudiante": ["estudiante"],
  "/observador": ["observador", "superadmin"],
  "/pendiente": ["pendiente", "superadmin"],
};

function esRutaPublica(p: string): boolean {
  return RUTAS_PUBLICAS.some((r) => p === r || p.startsWith(r + "/"));
}

function serializarError(error: unknown): {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
} {
  const value =
    error && typeof error === "object"
      ? (error as {
          name?: unknown;
          message?: unknown;
          status?: unknown;
          code?: unknown;
        })
      : {};

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    status: typeof value.status === "number" ? value.status : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
  };
}

type FaseFalloUpstream =
  | "auth_set_session"
  | "role_lookup"
  | "page_render";

function respuestaServicioNoDisponible(
  pathname: string,
  phase: FaseFalloUpstream,
  error: unknown,
): Response {
  console.error("upstream_unavailable", {
    pathname,
    phase,
    cause: serializarError(error),
  });

  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ code: "upstream_unavailable" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(
    "Servicio temporalmente no disponible. Intenta de nuevo más tarde.",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function esErrorServicioNoDisponible(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const status = typeof value.status === "number" ? value.status : 0;
  if (status >= 500) return true;

  const description = [value.name, value.message, value.code]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  return /fetch failed|network|timeout|timed out|econn|retryable/.test(
    description,
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  let phase: FaseFalloUpstream = "page_render";

  try {
    if (esRutaPublica(url.pathname)) return await next();

    const tokenAcceso = cookies.get("sb-access-token")?.value;
    const tokenRefresco = cookies.get("sb-refresh-token")?.value;

    if (!tokenAcceso || !tokenRefresco) return redirect("/auth");

    const cliente = crearClienteSuperbase();
    phase = "auth_set_session";
    const { data, error } = await cliente.auth.setSession({
      access_token: tokenAcceso,
      refresh_token: tokenRefresco,
    });

    if (error) {
      if (esErrorServicioNoDisponible(error)) {
        return respuestaServicioNoDisponible(url.pathname, phase, error);
      }
      return redirect("/auth");
    }
    if (!data.user?.email) return redirect("/auth");
    if (!esCorreoTec(data.user.email)) {
      await cliente.auth.signOut();
      cookies.delete("sb-access-token");
      cookies.delete("sb-refresh-token");
      return redirect("/auth");
    }

    // Autorización por rol
    for (const [prefijo, roles] of Object.entries(ROLES_POR_RUTA)) {
      if (url.pathname.startsWith(prefijo)) {
        phase = "role_lookup";
        const rol = await obtenerRolUsuario(data.user.id, cliente);

        if (!rol || !roles.includes(rol)) {
          return redirect("/?error=no-autorizado");
        }
        break;
      }
    }

    phase = "page_render";
    return await next();
  } catch (error) {
    return respuestaServicioNoDisponible(url.pathname, phase, error);
  }
});
