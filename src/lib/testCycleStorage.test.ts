import { describe, expect, it } from "vitest";
import { resolveManagedStorageObject } from "./testCycleStorage";

describe("test cycle storage cleanup", () => {
  it("constructs a deletion target only for the configured R2 public prefix", () => {
    expect(resolveManagedStorageObject(
      { bucket: "planeaciones", reference_kind: "url", object_reference: "https://files.example/planes/test.pdf" },
      { r2Enabled: true, r2PublicUrl: "https://files.example" },
    )).toEqual({ provider: "r2", bucket: "planeaciones", key: "planes/test.pdf" });
  });

  it("accepts only the expected Supabase public-storage URL while R2 is disabled", () => {
    expect(resolveManagedStorageObject(
      { bucket: "planeaciones", reference_kind: "url", object_reference: "https://project.supabase.co/storage/v1/object/public/planeaciones/test.pdf" },
      { r2Enabled: false, supabaseUrl: "https://project.supabase.co" },
    )).toEqual({ provider: "supabase", bucket: "planeaciones", key: "test.pdf" });
    expect(resolveManagedStorageObject(
      { bucket: "planeaciones", reference_kind: "url", object_reference: "https://other.example/test.pdf" },
      { r2Enabled: false, supabaseUrl: "https://project.supabase.co" },
    )).toBeNull();
  });
});
