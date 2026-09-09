import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("student import base-group resolution source contract", () => {
  const importer = readFileSync(
    new URL("../pages/api/admin/importar-alumnos.ts", import.meta.url),
    "utf8",
  );

  it("excludes subject-assignment groups from matching, ambiguity checks, and retries", () => {
    const resolutionStart = importer.indexOf(
      "const { data: baseGroups, error: groupsError }",
    );
    const resolutionSource = importer.slice(resolutionStart);

    expect(resolutionStart).toBeGreaterThan(-1);
    expect(resolutionSource).toContain('.is("asignatura_id", null);');
    expect(
      resolutionSource.indexOf('.is("asignatura_id", null);'),
    ).toBeLessThan(resolutionSource.indexOf("const exactCandidates"));
    expect(resolutionSource).toContain("for (const group of baseGroups || [])");
    expect(resolutionSource).toContain("(baseGroups || []).filter((group) =>");
    expect(resolutionSource).toContain(
      "const legacyCandidates = (baseGroups || []).filter(",
    );
    expect(resolutionSource).toContain(
      "selectCanonicalEquivalentBaseCandidate(exactCandidates)",
    );
    expect(resolutionSource).toContain(
      "selectCanonicalEquivalentBaseCandidate(legacyCandidates)",
    );
    expect(resolutionSource).toContain(
      "const retryBase = selectCanonicalEquivalentBaseCandidate(",
    );
    expect(resolutionSource).toContain("(baseGroups || []).push(group);");
    expect(resolutionSource).toMatch(
      /\.eq\("activo", true\)\s+\.is\("asignatura_id", null\);\s+const retryCandidates/,
    );
  });
});
