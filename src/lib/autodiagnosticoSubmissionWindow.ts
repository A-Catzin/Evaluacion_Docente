import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTODIAGNOSTICO_TIME_ZONE = "America/Cancun";

export type AutodiagnosticoSubmissionMode =
  | "manual_open"
  | "manual_closed"
  | "scheduled";
export type AutodiagnosticoSubmissionState =
  | "open"
  | "closed"
  | "not_configured"
  | "scheduled_pending"
  | "scheduled_ended";

export type AutodiagnosticoWindow = {
  configured: boolean;
  mode: AutodiagnosticoSubmissionMode | null;
  opens_at: string | null;
  closes_at: string | null;
  state: AutodiagnosticoSubmissionState;
};

const closedWindow: AutodiagnosticoWindow = {
  configured: false,
  mode: null,
  opens_at: null,
  closes_at: null,
  state: "not_configured",
};

export function formatAutodiagnosticoDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: AUTODIAGNOSTICO_TIME_ZONE,
  }).format(new Date(value));
}

export function autodiagnosticoSubmissionMessage(
  window: AutodiagnosticoWindow,
): string {
  const opensAt = formatAutodiagnosticoDate(window.opens_at);
  const closesAt = formatAutodiagnosticoDate(window.closes_at);
  if (window.state === "scheduled_pending" && opensAt) {
    return `La autoevaluación docente estará disponible a partir del ${opensAt}.`;
  }
  if (window.state === "scheduled_ended" && closesAt) {
    return `El periodo de autoevaluación docente finalizó el ${closesAt}.`;
  }
  if (window.state === "not_configured") {
    return "La autoevaluación docente no está habilitada para este cuatrimestre.";
  }
  return "El periodo de autoevaluación docente está cerrado para este cuatrimestre.";
}

export function autodiagnosticoWindowFromRpc(
  data: unknown,
): AutodiagnosticoWindow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { ...closedWindow };
  const value = row as Record<string, unknown>;
  const state = value.state;
  const mode = value.mode;
  if (
    ![
      "open",
      "closed",
      "not_configured",
      "scheduled_pending",
      "scheduled_ended",
    ].includes(String(state))
  ) {
    return { ...closedWindow };
  }
  return {
    configured: value.configured === true,
    mode: ["manual_open", "manual_closed", "scheduled"].includes(String(mode))
      ? (mode as AutodiagnosticoSubmissionMode)
      : null,
    opens_at: typeof value.opens_at === "string" ? value.opens_at : null,
    closes_at: typeof value.closes_at === "string" ? value.closes_at : null,
    state: state as AutodiagnosticoSubmissionState,
  };
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
  const offset = offsetFor(AUTODIAGNOSTICO_TIME_ZONE, new Date(utc));
  if (offset === null) return null;
  const parsed = new Date(utc - offset * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTODIAGNOSTICO_TIME_ZONE,
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
    timeZone: AUTODIAGNOSTICO_TIME_ZONE,
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

export function parseAutodiagnosticoWindowInput(body: Record<string, unknown>) {
  const cuatrimestreId = parsePositiveInteger(body.cuatrimestre_id);
  const mode = body.mode;
  if (
    !cuatrimestreId ||
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
        mode: mode as AutodiagnosticoSubmissionMode,
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
      mode,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
    },
  };
}

export async function getAutodiagnosticoSubmissionWindow(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<AutodiagnosticoWindow> {
  if (!Number.isSafeInteger(cuatrimestreId) || cuatrimestreId <= 0) {
    return { ...closedWindow };
  }
  const { data, error } = await client.rpc(
    "autodiagnostico_submission_window_state",
    {
      p_cuatrimestre_id: cuatrimestreId,
    },
  );
  if (error) return { ...closedWindow };
  return autodiagnosticoWindowFromRpc(data);
}

export async function requireTeacherAutodiagnosticoSubmissionOpen(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<Response | null> {
  const window = await getAutodiagnosticoSubmissionWindow(
    client,
    cuatrimestreId,
  );
  if (window.state === "open") return null;
  return new Response(
    JSON.stringify({
      error: autodiagnosticoSubmissionMessage(window),
      code: "autodiagnostico_submissions_closed",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
