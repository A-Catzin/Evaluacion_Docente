import type { SupabaseClient } from "@supabase/supabase-js";

export const INSTRUMENT_SUBMISSION_TIME_ZONE = "America/Cancun";

export type InstrumentSubmissionPurpose = "coordination" | "observation";
export type InstrumentSubmissionMode =
  | "manual_open"
  | "manual_closed"
  | "scheduled";
export type InstrumentSubmissionState =
  | "open"
  | "closed"
  | "not_configured"
  | "scheduled_pending"
  | "scheduled_ended";

export type InstrumentSubmissionWindow = {
  configured: boolean;
  mode: InstrumentSubmissionMode | null;
  opens_at: string | null;
  closes_at: string | null;
  state: InstrumentSubmissionState;
};

const closedWindow: InstrumentSubmissionWindow = {
  configured: false,
  mode: null,
  opens_at: null,
  closes_at: null,
  state: "not_configured",
};

function purposeName(purpose: InstrumentSubmissionPurpose): string {
  return purpose === "coordination"
    ? "La evaluación por coordinación"
    : "La observación de clase";
}

export function formatInstrumentSubmissionDate(
  value: string | null,
): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: INSTRUMENT_SUBMISSION_TIME_ZONE,
  }).format(new Date(value));
}

export function instrumentSubmissionMessage(
  purpose: InstrumentSubmissionPurpose,
  window: InstrumentSubmissionWindow,
): string {
  const name = purposeName(purpose);
  const opensAt = formatInstrumentSubmissionDate(window.opens_at);
  const closesAt = formatInstrumentSubmissionDate(window.closes_at);
  if (window.state === "scheduled_pending" && opensAt) {
    return `${name} estará disponible a partir del ${opensAt}.`;
  }
  if (window.state === "scheduled_ended" && closesAt) {
    return `El periodo de ${purpose === "coordination" ? "evaluación por coordinación" : "observación de clase"} finalizó el ${closesAt}.`;
  }
  if (window.state === "not_configured") {
    return `${name} no está habilitada para este cuatrimestre.`;
  }
  return `${name} no está disponible en este momento.`;
}

export function instrumentSubmissionWindowFromRpc(
  data: unknown,
): InstrumentSubmissionWindow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { ...closedWindow };
  const value = row as Record<string, unknown>;
  if (
    ![
      "open",
      "closed",
      "not_configured",
      "scheduled_pending",
      "scheduled_ended",
    ].includes(String(value.state))
  ) {
    return { ...closedWindow };
  }
  return {
    configured: value.configured === true,
    mode: ["manual_open", "manual_closed", "scheduled"].includes(
      String(value.mode),
    )
      ? (value.mode as InstrumentSubmissionMode)
      : null,
    opens_at: typeof value.opens_at === "string" ? value.opens_at : null,
    closes_at: typeof value.closes_at === "string" ? value.closes_at : null,
    state: value.state as InstrumentSubmissionState,
  };
}

export async function getInstrumentSubmissionWindow(
  client: SupabaseClient,
  cuatrimestreId: number,
  purpose: InstrumentSubmissionPurpose,
): Promise<InstrumentSubmissionWindow> {
  if (!Number.isSafeInteger(cuatrimestreId) || cuatrimestreId <= 0) {
    return { ...closedWindow };
  }
  const { data, error } = await client.rpc(
    "instrument_submission_window_state",
    {
      p_cuatrimestre_id: cuatrimestreId,
      p_purpose: purpose,
    },
  );
  if (error) return { ...closedWindow };
  return instrumentSubmissionWindowFromRpc(data);
}

export function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value.trim())) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function offsetFor(timeZone: string, date: Date): number | null {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  const match = part?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export function parseCancunDateTimeLocal(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const offset = offsetFor(INSTRUMENT_SUBMISSION_TIME_ZONE, new Date(utc));
  if (offset === null) return null;
  const parsed = new Date(utc - offset * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INSTRUMENT_SUBMISSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(parsed)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` ===
    value
    ? parsed
    : null;
}

export function formatCancunDateTimeLocal(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INSTRUMENT_SUBMISSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseInstrumentSubmissionWindowInput(
  body: Record<string, unknown>,
) {
  const cuatrimestreId = parsePositiveInteger(body.cuatrimestre_id);
  const purpose = body.purpose;
  const mode = body.mode;
  if (
    !cuatrimestreId ||
    !["coordination", "observation"].includes(String(purpose)) ||
    !["manual_open", "manual_closed", "scheduled"].includes(String(mode))
  ) {
    return {
      ok: false as const,
      error: "La configuración de acceso no es válida.",
    };
  }
  if (mode !== "scheduled") {
    return {
      ok: true as const,
      value: {
        cuatrimestreId,
        purpose: purpose as InstrumentSubmissionPurpose,
        mode: mode as InstrumentSubmissionMode,
        opensAt: null,
        closesAt: null,
      },
    };
  }
  const opensAt = parseCancunDateTimeLocal(body.opens_at);
  const closesAt = parseCancunDateTimeLocal(body.closes_at);
  if (!opensAt || !closesAt || opensAt >= closesAt) {
    return {
      ok: false as const,
      error:
        "La ventana programada requiere fechas y horas válidas en horario de Cancún, con inicio anterior al cierre.",
    };
  }
  return {
    ok: true as const,
    value: {
      cuatrimestreId,
      purpose: purpose as InstrumentSubmissionPurpose,
      mode: "scheduled" as const,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
    },
  };
}
