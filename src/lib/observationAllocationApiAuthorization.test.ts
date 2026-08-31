import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const api = readFileSync(
  new URL("../pages/api/admin/observation-allocation.ts", import.meta.url),
  "utf8",
);

describe("observation allocation admin API", () => {
  it("requires superadmin and only forwards a server-bound preview confirmation", () => {
    expect(api).toContain('requireRole(cookies, ["superadmin"])');
    expect(api).toContain('p_cuatrimestre_id: cycleId');
    expect(api).toContain('p_preview_id: body.preview_id');
    expect(api).toContain('p_fingerprint: body.fingerprint');
    expect(api).not.toContain("actor_id");
  });
});
