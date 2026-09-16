import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const middlewareSource = readFileSync(
  new URL("../middleware.ts", import.meta.url),
  "utf8",
);

describe("Supabase resilience source contracts", () => {
  it("creates a fresh user-scoped client while retaining the admin client cache", () => {
    expect(dbSource).toMatch(
      /import \{ crearClienteSuperbase, obtenerClienteAdmin \}/,
    );
    expect(dbSource).toMatch(
      /export function db\(\): SupabaseClient \{\s*return crearClienteSuperbase\(\);\s*\}/,
    );
    expect(dbSource).not.toMatch(/let _cachedDb: SupabaseClient/);
    expect(dbSource).toContain("cliente: SupabaseClient = db()");
    expect(dbSource).toContain("if (error) throw error");
    expect(dbSource).toMatch(
      /let _cachedDbAdmin: SupabaseClient \| null = null;/,
    );
    expect(dbSource).toMatch(
      /export function dbAdmin\(\): SupabaseClient \{\s*if \(!_cachedDbAdmin\) _cachedDbAdmin = obtenerClienteAdmin\(\);\s*return _cachedDbAdmin;\s*\}/,
    );
  });

  it("returns no-store 503 fallbacks for API and page upstream failures", () => {
    expect(middlewareSource).toMatch(
      /function respuestaServicioNoDisponible\(\s*pathname: string,\s*phase: FaseFalloUpstream,\s*error: unknown,?\s*\): Response/,
    );
    expect(middlewareSource).toMatch(
      /pathname\.startsWith\("\/api\/"\)[\s\S]*?JSON\.stringify\(\{ code: "upstream_unavailable" \}\)[\s\S]*?status: 503[\s\S]*?"Cache-Control": "no-store"/,
    );
    expect(middlewareSource).toMatch(
      /Servicio temporalmente no disponible[\s\S]*?status: 503[\s\S]*?"Cache-Control": "no-store"/,
    );
    expect(middlewareSource).toMatch(
      /function serializarError\(error: unknown\): \{[\s\S]*?name\?: string;[\s\S]*?message\?: string;[\s\S]*?status\?: number;[\s\S]*?code\?: string;/,
    );
    expect(middlewareSource).toMatch(
      /type FaseFalloUpstream =\s*\| "auth_set_session"\s*\| "role_lookup"\s*\| "page_render";/,
    );
    expect(middlewareSource).toMatch(
      /console\.error\("upstream_unavailable", \{\s*pathname,\s*phase,\s*cause: serializarError\(error\),\s*\}\);/,
    );
    expect(middlewareSource).toMatch(
      /phase = "auth_set_session";\s*const \{ data, error \} = await cliente\.auth\.setSession/,
    );
    expect(middlewareSource).toMatch(
      /phase = "role_lookup";\s*const rol = await obtenerRolUsuario/,
    );
    expect(middlewareSource).toMatch(
      /phase = "page_render";\s*return await next\(\);/,
    );
    expect(middlewareSource).toMatch(
      /if \(esErrorServicioNoDisponible\(error\)\) \{\s*return respuestaServicioNoDisponible\(url\.pathname, phase, error\);\s*\}/,
    );
    expect(middlewareSource).toContain("esErrorServicioNoDisponible(error)");
    expect(middlewareSource).toContain(
      "obtenerRolUsuario(data.user.id, cliente)",
    );
    expect(middlewareSource).toMatch(/status >= 500/);
    expect(middlewareSource).toMatch(/fetch failed\|network\|timeout/);
    expect(middlewareSource).toMatch(
      /catch \(error\) \{\s*return respuestaServicioNoDisponible\(url\.pathname, phase, error\);\s*\}/,
    );
  });
});
