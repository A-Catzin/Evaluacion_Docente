import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("../components/NotificationBell.astro", import.meta.url),
  "utf8",
);

function functionBody(name: string, nextFunction: string) {
  const start = component.indexOf(`function ${name}()`);
  const end = component.indexOf(`\n  function ${nextFunction}`, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return component.slice(start, end);
}

describe("notification bell loading", () => {
  it("loads notifications when the bell opens", () => {
    const toggleBell = functionBody("toggleBell", "cargarNotificaciones");

    expect(toggleBell).toMatch(
      /if\s*\(bellOpen\)\s*\{[\s\S]*?cargarNotificaciones\(\)/,
    );
  });

  it("only fetches notifications through the loader or mark-all action", () => {
    const cargarNotificaciones = functionBody(
      "cargarNotificaciones",
      "leerNotificacion",
    );
    const outsideLoader = component.replace(cargarNotificaciones, "");

    expect(cargarNotificaciones).toContain("fetch('/api/notificaciones')");
    expect(
      outsideLoader.match(/fetch\('\/api\/notificaciones'/g) ?? [],
    ).toHaveLength(1);
    expect(outsideLoader).toContain(
      "fetch('/api/notificaciones', {method:'POST'})",
    );
  });

  it("does not introduce notification polling", () => {
    expect(component).not.toMatch(/\bsetInterval\s*\(/);
  });
});
