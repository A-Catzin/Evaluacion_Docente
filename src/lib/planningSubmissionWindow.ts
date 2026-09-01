import type { SupabaseClient } from "@supabase/supabase-js";

export const PLANNING_TIME_ZONE = "America/Cancun";
// Vercel Functions reject request bodies over 4.5 MB before this handler runs.
// Leave room for multipart form fields and boundaries.
export const MAX_PLANNING_PDF_BYTES = 4 * 1024 * 1024;

export type PlanningSubmissionMode =
  | "manual_open"
  | "manual_closed"
  | "scheduled";
export type PlanningSubmissionState =
  | "open"
  | "closed"
  | "not_configured"
  | "scheduled_pending"
  | "scheduled_ended";

export type PlanningWindow = {
  configured: boolean;
  mode: PlanningSubmissionMode | null;
  opens_at: string | null;
  closes_at: string | null;
  state: PlanningSubmissionState;
};

export function formatPlanningDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: PLANNING_TIME_ZONE,
  }).format(new Date(value));
}

export function planningSubmissionMessage(window: PlanningWindow): string {
  const opensAt = formatPlanningDate(window.opens_at);
  const closesAt = formatPlanningDate(window.closes_at);
  if (window.state === "scheduled_pending" && opensAt) {
    return `El periodo de entrega de planeaciones estará disponible a partir del ${opensAt}.`;
  }
  if (window.state === "scheduled_ended" && closesAt) {
    return `El periodo de entrega de planeaciones finalizó el ${closesAt}.`;
  }
  if (window.state === "not_configured") {
    return "Las entregas de planeación no están habilitadas para este cuatrimestre.";
  }
  return "El periodo de entrega de planeaciones está cerrado para este cuatrimestre.";
}

export function planningWindowFromRpc(data: unknown): PlanningWindow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      configured: false,
      mode: null,
      opens_at: null,
      closes_at: null,
      state: "not_configured",
    };
  }
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
    return {
      configured: false,
      mode: null,
      opens_at: null,
      closes_at: null,
      state: "not_configured",
    };
  }
  return {
    configured: value.configured === true,
    mode: ["manual_open", "manual_closed", "scheduled"].includes(String(mode))
      ? (mode as PlanningSubmissionMode)
      : null,
    opens_at: typeof value.opens_at === "string" ? value.opens_at : null,
    closes_at: typeof value.closes_at === "string" ? value.closes_at : null,
    state: state as PlanningSubmissionState,
  };
}

export async function getPlanningSubmissionWindow(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<PlanningWindow> {
  if (!Number.isSafeInteger(cuatrimestreId) || cuatrimestreId <= 0) {
    return {
      configured: false,
      mode: null,
      opens_at: null,
      closes_at: null,
      state: "not_configured",
    };
  }
  const { data, error } = await client.rpc("planning_submission_window_state", {
    p_cuatrimestre_id: cuatrimestreId,
  });
  if (error)
    return {
      configured: false,
      mode: null,
      opens_at: null,
      closes_at: null,
      state: "not_configured",
    };
  return planningWindowFromRpc(data);
}

export async function requireTeacherPlanningSubmissionOpen(
  client: SupabaseClient,
  cuatrimestreId: number,
): Promise<Response | null> {
  const window = await getPlanningSubmissionWindow(client, cuatrimestreId);
  if (window.state === "open") return null;
  return new Response(
    JSON.stringify({
      error: planningSubmissionMessage(window),
      code: "planning_submissions_closed",
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

export type PlanningPdfValidation =
  | { ok: true; extension: "pdf" }
  | { ok: false; error: string };

export function validatePlanningPdf(file: File): PlanningPdfValidation {
  if (file.size <= 0 || file.size > MAX_PLANNING_PDF_BYTES) {
    return { ok: false, error: "El archivo PDF debe pesar máximo 4 MB." };
  }
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return {
      ok: false,
      error: "Solo se aceptan archivos PDF con extensión .pdf.",
    };
  }
  return { ok: true, extension: "pdf" };
}

export function parsePositiveInteger(
  value: FormDataEntryValue | unknown,
): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value.trim()))
    return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function resolveTeacherPlanningGroup(
  client: SupabaseClient,
  docenteId: number,
  cuatrimestreId: number,
  asignaturaId: number,
  grupo: string,
) {
  if (!grupo.trim()) return null;
  const { data, error } = await client
    .from("grupos")
    .select("id,clave,modalidad")
    .eq("docente_id", docenteId)
    .eq("cuatrimestre_id", cuatrimestreId)
    .eq("asignatura_id", asignaturaId)
    .eq("clave", grupo.trim())
    .eq("activo", true)
    .maybeSingle();
  if (error || !data || data.modalidad !== "Escolarizado") return null;
  return data;
}

export function buildPlanningPdfPath(
  cuatrimestreId: number,
  docenteId: number,
): string {
  return `planeaciones/${cuatrimestreId}/${docenteId}/${crypto.randomUUID()}.pdf`;
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
  const offset = offsetFor(PLANNING_TIME_ZONE, new Date(utc));
  if (offset === null) return null;
  const parsed = new Date(utc - offset * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLANNING_TIME_ZONE,
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
    timeZone: PLANNING_TIME_ZONE,
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

export function parsePlanningWindowInput(body: Record<string, unknown>) {
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
        mode: mode as PlanningSubmissionMode,
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
