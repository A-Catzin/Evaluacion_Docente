import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/admin/planeaciones/evaluar/[id].astro", import.meta.url), "utf8");

describe("planning evaluation status control", () => {
  it("keeps the submitted status value while exposing an accessible full-width trigger and listbox", () => {
    expect(page).toContain('<input id="estado" name="estado" type="hidden" value="" />');
    expect(page).toContain('id="estado-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="estado-listbox"');
    expect(page).toContain('class="w-full min-w-0 max-w-full inline-flex');
    expect(page).toContain('id="estado-listbox" role="listbox" tabindex="-1"');
    expect(page).toContain('role="option"');
    expect(page).toContain('data-value="Aprobado"');
    expect(page).toContain('data-value="Corrección"');
    expect(page).not.toContain('<select id="estado"');
  });

  it("portals a viewport-safe popup with Floating UI positioning middleware", () => {
    expect(page).toContain("from '@floating-ui/dom'");
    expect(page).toContain('document.body.appendChild(listbox)');
    expect(page).toContain("strategy: 'fixed'");
    expect(page).toContain('middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })]');
    expect(page).toContain('cleanupAutoUpdate = autoUpdate(trigger, listbox, updatePosition)');
    expect(page).toContain('cleanupAutoUpdate?.()');
  });

  it("supports click, keyboard, outside dismissal, and navigation teardown without mousedown interaction", () => {
    expect(page).toContain('class="min-w-0"');
    expect(page).toContain("trigger.addEventListener('click', onTriggerClick)");
    expect(page).toContain("document.addEventListener('click', onDocumentClick)");
    expect(page).toContain("event.key === 'Escape'");
    expect(page).toContain('ArrowDown');
    expect(page).toContain('ArrowUp');
    expect(page).toContain('Home');
    expect(page).toContain('End');
    expect(page).toContain("form.addEventListener('submit', onFormTeardown)");
    expect(page).toContain("document.addEventListener('astro:before-swap', teardown, { once: true })");
    expect(page).toContain("document.removeEventListener('click', onDocumentClick)");
    expect(page).not.toMatch(/(?:mouse|pointer)(?:down|up)/i);
    expect(page).toContain('focus-visible:ring-2 focus-visible:ring-tup');
  });
});
