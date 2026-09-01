import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { r2ConfigurationDiagnosticCode, r2ConfigurationStatus } from "./storage";

describe("R2 configuration diagnostics", () => {
  it("reports only presence and HTTPS shape", () => {
    expect(r2ConfigurationStatus({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "https://files.example",
    })).toEqual({
      enabled: true,
      accountIdPresent: true,
      accessKeyPresent: true,
      secretAccessKeyPresent: true,
      bucketPresent: true,
      publicUrlPresent: true,
      publicUrlHttps: true,
    });
  });

  it("does not treat a malformed public URL as valid", () => {
    expect(r2ConfigurationStatus({ R2_PUBLIC_URL: "not-a-url" }).publicUrlHttps).toBe(false);
  });

  it("enables R2 only when every required value is complete and valid", () => {
    expect(r2ConfigurationStatus({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "https://files.example/path",
    }).enabled).toBe(true);
    expect(r2ConfigurationStatus({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "https://files.example/path?token=unsafe",
    }).enabled).toBe(false);
  });

  it("uses safe reason categories for incomplete and invalid configuration", () => {
    expect(r2ConfigurationDiagnosticCode(r2ConfigurationStatus({}))).toBe("r2_config_missing");
    expect(r2ConfigurationDiagnosticCode(r2ConfigurationStatus({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "http://files.example",
    }))).toBe("r2_public_url_invalid");
  });

  it("keeps the production diagnostic superadmin-only and sanitized", () => {
    const endpoint = readFileSync(
      new URL("../pages/api/admin/planeaciones/diagnostico.ts", import.meta.url),
      "utf8",
    );
    expect(endpoint).toContain('requireRole(cookies, ["superadmin"])');
    expect(endpoint).toContain("diagnosticarR2");
    expect(endpoint).not.toContain(".message");
    expect(endpoint).not.toContain(".stack");
  });
});
