import type { SupabaseClient } from "@supabase/supabase-js";

export type InstrumentOption = { value: number; label: string };
export type VersionedInstrumentItem = {
  id: string;
  code: string;
  label: string;
  guidance?: string | null;
  position: number;
  scored: boolean;
  na_eligible: boolean;
  na_policy: Record<string, unknown>;
};
export type VersionedInstrumentSection = {
  id: string;
  code: string;
  title: string;
  position: number;
  scored: boolean;
  items: VersionedInstrumentItem[];
};
export type VersionedAdministrativeCheck = {
  id: string;
  section_code: string;
  code: string;
  label: string;
  position: number;
  na_eligible: boolean;
};
export type VersionedInstrumentDefinition = {
  version_id: string;
  definition_code: string;
  purpose: "coordination" | "planning" | "observation";
  title: string;
  version: string;
  scale: { min: number; max: number; labels: Record<string, string> };
  scoring: { na_threshold_percent: number };
  sections: VersionedInstrumentSection[];
  administrative_checks: VersionedAdministrativeCheck[];
};

export async function getActiveInstrumentDefinition(
  client: SupabaseClient,
  code: string,
): Promise<VersionedInstrumentDefinition | null> {
  const { data, error } = await client.rpc("get_active_instrument_definition", {
    p_code: code,
  });
  if (error || !data || typeof data !== "object") return null;
  return data as VersionedInstrumentDefinition;
}

export function instrumentOptions(definition: VersionedInstrumentDefinition): InstrumentOption[] {
  return Array.from(
    { length: definition.scale.max - definition.scale.min + 1 },
    (_, index) => {
      const value = definition.scale.min + index;
      return { value, label: definition.scale.labels[String(value)] ?? String(value) };
    },
  );
}
