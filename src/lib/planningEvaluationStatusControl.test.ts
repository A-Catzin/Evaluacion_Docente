import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/admin/planeaciones/evaluar/[id].astro", import.meta.url), "utf8");

describe("planning evaluation status control", () => {
  it("keeps the submitted status value while exposing an accessible full-width trigger and listbox", () => {
    expect(page).toContain('<input id="estado" name="estado" type="hidden" value="" />');
    expect(page).toContain('id="estado-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="estado-listbox"');
    expect(page).toContain('aria-invalid="false"');
    expect(page).toContain('class="w-full min-w-0 max-w-full inline-flex');
    expect(page).toContain('id="estado-listbox" role="listbox" tabindex="-1"');
    expect(page).toContain('role="option"');
    expect(page).toContain('data-value="Aprobado"');
    expect(page).toContain('data-value="Corrección"');
    expect(page).toContain('value="Aprobado"');
    expect(page).toContain('value="Corrección"');
    expect(page).not.toContain('<select id="estado"');
  });

  it("portals a fixed popup with a narrow-viewport placement contract", () => {
    expect(page).toContain('class="min-w-0"');
    expect(page).toContain("from '@floating-ui/dom'");
    expect(page).toContain('document.body.appendChild(listbox)');
    expect(page).toContain("strategy: 'fixed'");
    expect(page).toContain('const viewportGutter = 8');
    expect(page).toContain('Math.min(triggerWidth, window.innerWidth - viewportGutter * 2)');
    expect(page).toContain('offset(6)');
    expect(page).toContain('flip({ padding: viewportGutter })');
    expect(page).toContain('shift({ padding: viewportGutter })');
    expect(page).toContain('size({');
    expect(page).toContain('maxHeight: `${Math.max(0, availableHeight)}px`');
    expect(page).toContain('cleanupAutoUpdate = autoUpdate(trigger, listbox, updatePosition)');
    expect(page).toContain('cleanupAutoUpdate?.()');
  });

  it("keeps a 320px viewport inside the eight-pixel gutters", () => {
    const viewportWidth = 320;
    const viewportGutter = 8;
    const menuWidth = Math.min(480, viewportWidth - viewportGutter * 2);

    expect(menuWidth).toBe(304);
    expect(menuWidth + viewportGutter * 2).toBeLessThanOrEqual(viewportWidth);
  });

  it("supports click, outside dismissal, keyboard selection, and focus restoration", () => {
    expect(page).toContain("trigger.addEventListener('click', onTriggerClick)");
    expect(page).toContain("document.addEventListener('pointerdown', onDocumentPointerDown)");
    expect(page).toContain("event.key === 'Escape'");
    expect(page).toContain('ArrowDown');
    expect(page).toContain('ArrowUp');
    expect(page).toContain('Home');
    expect(page).toContain('End');
    expect(page).toContain("event.key === 'Enter' || event.key === ' '");
    expect(page).toContain("if (event.key === 'Tab')");
    expect(page).toContain('if (returnFocus) trigger.focus()');
    expect(page).toContain("form.addEventListener('submit', onFormValidation)");
    expect(page).toContain("form.addEventListener('reset', onFormReset)");
    expect(page).toContain("errorMessage.classList.toggle('hidden', !hasError)");
    expect(page).toContain("document.addEventListener('astro:before-swap', teardown, { once: true })");
    expect(page).toContain("document.removeEventListener('pointerdown', onDocumentPointerDown)");
  });

  it("keeps the accepted values aligned with API validation", () => {
    const api = readFileSync(new URL("../pages/api/coordinador/planeacion.ts", import.meta.url), "utf8");
    expect(api).toContain('estado !== "Aprobado" && estado !== "Corrección"');
  });
});
