import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const endpoint = new URL(
  "../pages/api/docente/autodiagnostico.ts",
  import.meta.url,
);
const source = readFileSync(endpoint, "utf8");

describe("autodiagnostico API resilience diagnostics", () => {
  it("assigns a correlation ID and includes elapsed duration in structured errors", () => {
    expect(source).toContain('import { randomUUID } from "node:crypto"');
    expect(source).toContain("const correlationId = randomUUID()");
    expect(source).toContain("const startedAt = Date.now()");
    expect(source).toContain("elapsedMs: Date.now() - startedAt");
    expect(source).toContain(
      'console.error("[API Autodiagnóstico] request failed", {',
    );
    expect(source).toContain("error: serializeSafeError(error)");
  });

  it("logs safe, field-level diagnostics for schema rejection", () => {
    expect(source).toContain(
      'logError("payload_validation", new Error("Payload rejected by schema"), {',
    );
    expect(source).toContain(
      "validationIssues: validationIssues(parseResult.error)",
    );
    expect(source).toContain("...payloadSummary(body)");
    expect(source).toContain("payloadKeyNames");
    expect(source).toContain("payloadKeyTypes");
    expect(source).toContain("reactivosCount");
    expect(source).toContain("reasonCategory: issue.code");
  });

  it("logs a categorized moderation rejection without the comment contents", () => {
    expect(source).toContain(
      'logError("comment_moderation", new Error("Comment rejected"), {',
    );
    expect(source).toContain('? "max_length"');
    expect(source).toContain(': "blacklist"');
    expect(source).toContain(
      'length: typeof comentarios === "string" ? comentarios.length : null',
    );
  });

  it("does not send raw request data, answers, comments, or credentials to console errors", () => {
    expect(source).toContain("function serializeSafeError(error: unknown)");
    expect(source).toContain("[redacted-secret]");
    expect(source).not.toContain("console.error(body");
    expect(source).not.toContain("console.error(comentarios");
    expect(source).not.toContain("console.error(reactivos");
    expect(source).not.toContain("console.error(insert");
    expect(source).not.toContain("logRecalcError(");
  });
});
