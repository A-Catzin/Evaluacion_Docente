import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const newRoute = readFileSync(new URL("../pages/coordinador/captura/observacion/[tipo].astro", import.meta.url), "utf8");
const escolarizadoRoute = readFileSync(new URL("../pages/coordinador/captura/observacion-escolarizado.astro", import.meta.url), "utf8");
const virtualRoute = readFileSync(new URL("../pages/coordinador/captura/observacion-virtual.astro", import.meta.url), "utf8");
const ejecutivoRoute = readFileSync(new URL("../pages/coordinador/captura/observacion-ejecutivo.astro", import.meta.url), "utf8");

const component = readFileSync(
  new URL("./VersionedInstrumentCapture.astro", import.meta.url),
  "utf8",
);

describe("VersionedInstrumentCapture", () => {
  it("renders definition-provided sections and computes N/A state from their real size", () => {
    expect(component).toContain("definition.sections.map");
    expect(component).toContain("section.items.map");
    expect(component).toContain("definition.sections.reduce");
    expect(component).toContain("naCount * 100 > total * 20");
    expect(component).not.toContain("/ 61");
  });

  it("shows N/A only when configured and requires evidence and feedback", () => {
    expect(component).toContain("item.na_eligible");
    expect(component).toContain("Cada N/A requiere un motivo");
    expect(component).toContain("data-evidence");
    expect(component).toContain("metadata-recommendation");
  });

  it("aligns client text limits with the API and surfaces field details", () => {
    expect(component).toContain("maxlength={MAX_INSTRUMENT_TEXT_LENGTH}");
    expect(component).toContain("formatApiError(result");
    expect(component).toContain("result.detalles");
  });

  it("opts in only on the four-format route and gates capture on a current teacher HEAD", () => {
    expect(component).toContain("allowReevaluation?: boolean");
    expect(component).toContain("allowReevaluation = false");
    for (const route of [newRoute, escolarizadoRoute, virtualRoute, ejecutivoRoute]) {
      expect(route).toContain("allowReevaluation={true}");
    }
    expect(component).toContain('fetch("/api/instrumentos/revision-draft?"');
    expect(component).toContain("sequence !== draftLoadSequence");
    expect(component).toContain("revisionHead.id");
    expect(component).toContain('if (sequence !== draftLoadSequence || observationDraftContext()?.key !== context.key) return');
    expect(component).toContain('if (allowReevaluation && (!revisionReady || revisionLocked || revisionBody');
    expect(component).toContain("Continuar reevaluación");
    expect(component).toContain('id="revision-start" type="button" disabled');
    expect(component).toContain('revisionStart.hidden = false');
    expect(component).toContain('revisionStart.disabled = action !== "start"');
    expect(component).toContain("Reevaluar");
  });

  it("separates revision draft and submission paths from legacy initial paths", () => {
    expect(component).toContain('fetch("/api/instrumentos/draft?"');
    expect(component).toContain('fetch("/api/instrumentos/draft",');
    expect(component).toContain('fetch("/api/instrumentos/revision-draft",');
    expect(component).toContain('fetch("/api/instrumentos/reevaluacion",');
    expect(component).toContain("operation_id: revisionIntent.operation_id");
    expect(component).toContain("supersedes_submission_id: revisionIntent.supersedes_submission_id");
    expect(component).toContain("delete revisionPayload.source_record_id");
    expect(component).toContain("delete revisionPayload.checks");
    expect(component).toContain('method: "DELETE"');
    expect(component).toContain('if (revision) draft.answers.forEach');
  });

  it("freezes the exact revision request on ambiguous errors until an explicit retry", () => {
    expect(component).toContain("revisionBody = JSON.stringify(revisionPayload)");
    expect(component).toContain("body: revisionBody");
    expect(component).toContain("Reintentar envío");
    expect(component).toContain("Resolver / recargar");
    expect(component).toContain("[400, 403, 409].includes(response.status)");
    expect(component).toContain('result?.success !== true || typeof result.id !== "string"');
    expect(component).toContain('revisionLocked = true');
    expect(component).toContain('revisionTeacher.disabled = true');
    expect(component).toContain('if (!revisionBody || revisionSending || !revisionIntent || revisionLocked) return');
  });

  it("does not expose technical item codes on opted-in forms, preserving legacy numbering", () => {
    expect(component).toContain("allowReevaluation ? item.label : item.code");
    expect(component).toContain("{section.title}");
  });

  it("normalizes N/A reasons only for N/A answers in the inline script", () => {
    const script = component.match(/<script is:inline define:vars=[^\n]*>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    const helper = script!.match(/^\s*function normalizeNaReason\(value, reason\) \{[\s\S]*?^\s*\}/m)?.[0];
    expect(helper).toBeDefined();
    const normalize = Function(`"use strict"; ${helper}; return normalizeNaReason;`)() as
      (value: string | number, reason: string | null | undefined) => string | null;

    for (const score of ["1", "2", "3", 1, 2, 3]) {
      expect(normalize(score, "  leftover hidden reason  ")).toBeNull();
    }
    expect(normalize("na", "  actual reason  ")).toBe("actual reason");
    expect(normalize("na", "  ")).toBeNull();
    expect(normalize("na", null)).toBeNull();
  });

  it("uses N/A-only normalization for draft saves, initial submissions, hydration, toggles and revisions", () => {
    const section = (start: string, end: string) => {
      const first = component.indexOf(start);
      expect(first).toBeGreaterThanOrEqual(0);
      const last = component.indexOf(end, first + start.length);
      expect(last).toBeGreaterThan(first);
      return component.slice(first, last);
    };
    const collect = section("function collectObservationDraft()", "function hydrateObservationDraft(");
    expect(collect).toMatch(/na_reason:\s*normalizeNaReason\(selected\.value,/);
    const save = section("async function saveObservationDraft()", "async function sendRevision()");
    expect(save).toContain("const draft = collectObservationDraft()");
    expect(save).toContain('fetch(revision ? "/api/instrumentos/revision-draft" : "/api/instrumentos/draft"');

    const submit = section('form.addEventListener("submit", async function(event)', "const checks =");
    expect(submit).toMatch(/na_reason:\s*normalizeNaReason\(selected\?\.value,/);
    expect(submit).toContain('selected?.value === "na" && !reason');
    expect(component).toContain('fetch("/api/instrumentos/submit"');
    expect(component).toContain("revisionBody = JSON.stringify(revisionPayload)");

    const hydrate = section("function hydrateObservationDraft(draft)", "async function loadObservationDraft()");
    expect(hydrate).toMatch(/reasonField\.value\s*=\s*normalizeNaReason\(answer\.value,\s*answer\.na_reason\)\s*\|\|\s*""/);
    const toggle = section('form.addEventListener("change", function(event)', "function observationDraftContext()");
    expect(toggle).toMatch(/if \(item\)[\s\S]*?\.value\s*=\s*normalizeNaReason\(input\.value,/);
  });
});
