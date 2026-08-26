export type StorageCleanupEntry = {
  bucket: "planeaciones" | "avisos";
  object_reference: string;
  reference_kind: "url" | "path";
};

type StorageEnvironment = {
  r2Enabled: boolean;
  r2PublicUrl?: string;
  supabaseUrl?: string;
};

export type ManagedStorageObject = {
  provider: "r2" | "supabase";
  bucket: StorageCleanupEntry["bucket"];
  key: string;
};

function validKey(key: string): boolean {
  return !!key && !key.startsWith("/") && !key.split("/").some((part) => !part || part === "." || part === "..");
}

function prefix(url: string | undefined): string | null {
  return url ? `${url.replace(/\/$/, "")}/` : null;
}

export function resolveManagedStorageObject(
  entry: StorageCleanupEntry,
  environment: StorageEnvironment,
): ManagedStorageObject | null {
  if (entry.reference_kind === "path") {
    return environment.r2Enabled && validKey(entry.object_reference)
      ? { provider: "r2", bucket: entry.bucket, key: entry.object_reference }
      : null;
  }

  const r2Prefix = prefix(environment.r2PublicUrl);
  if (environment.r2Enabled && r2Prefix && entry.object_reference.startsWith(r2Prefix)) {
    const key = entry.object_reference.slice(r2Prefix.length);
    return validKey(key) && !key.includes("?") && !key.includes("#")
      ? { provider: "r2", bucket: entry.bucket, key }
      : null;
  }

  const supabasePrefix = prefix(environment.supabaseUrl);
  const expectedPrefix = supabasePrefix
    ? `${supabasePrefix}storage/v1/object/public/${entry.bucket}/`
    : null;
  if (!environment.r2Enabled && expectedPrefix && entry.object_reference.startsWith(expectedPrefix)) {
    const key = entry.object_reference.slice(expectedPrefix.length);
    return validKey(key) && !key.includes("?") && !key.includes("#")
      ? { provider: "supabase", bucket: entry.bucket, key }
      : null;
  }

  return null;
}
