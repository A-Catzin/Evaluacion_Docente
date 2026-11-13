import type { APIRoute } from "astro";
import { AuthError, requireRole } from "../../../lib/auth";
import { toCsv } from "../../../lib/csv";
import { dbAdmin } from "../../../lib/db";
import { fetchAllRows } from "../../../lib/fetchAllRows";
import { deriveShift, format360Headers, format360Row, type ScoreRow } from "../../../lib/format360Export";
import { formatPersonName } from "../../../lib/personName";
import { obtenerCalificacionesPorCuatrimestre } from "../../../services/calificaciones";

export const prerender = false;

const fail = (message: string, status: number) => new Response(message, { status });

function nameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Final grades of a cycle keyed by teacher. Cycles without data give an empty map. */
async function scoresByTeacher(client: ReturnType<typeof dbAdmin>, cycleId: number) {
  const rows = (await obtenerCalificacionesPorCuatrimestre(client, cycleId, {
    incluirFallbackInline: false,
  })) as unknown as Array<ScoreRow & { docente_id: number }>;
  return new Map(rows.map((row) => [Number(row.docente_id), row]));
}

/**
 * GET /api/admin/exportar-formato-360?cuatrimestre_id=N
 * Spreadsheet in the Academia layout: the selected cycle, the manual action-plan columns and the previous cycle.
 */
export const GET: APIRoute = async ({ cookies, url }) => {
  try {
    await requireRole(cookies, ["superadmin"]);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return fail("Error interno", 500);
  }
  const cycleId = Number.parseInt(url.searchParams.get("cuatrimestre_id") || "", 10);
  if (!Number.isSafeInteger(cycleId) || cycleId < 1) return fail("cuatrimestre_id válido requerido", 400);

  try {
    const client = dbAdmin();
    const { data: cycle, error: cycleError } = await client
      .from("cuatrimestres").select("id,clave").eq("id", cycleId).maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle) return fail("Ciclo no encontrado", 404);
    const { data: previousCycle } = await client
      .from("cuatrimestres").select("id,clave").lt("id", cycleId).order("id", { ascending: false }).limit(1).maybeSingle();

    const [groups, schedules, teachers, assignments, coordinations, current, previous] = await Promise.all([
      fetchAllRows<{ id: number; docente_id: number; plan_normalizado: string | null; turno_grupo: string | null }>((from, to) =>
        client.from("grupos").select("id,docente_id,plan_normalizado,turno_grupo")
          .eq("cuatrimestre_id", cycleId).eq("activo", true).not("docente_id", "is", null).order("id").range(from, to)),
      fetchAllRows<{ grupo_id: number; hora_inicio: string }>((from, to) =>
        client.from("horarios_grupo").select("grupo_id,hora_inicio").eq("activo", true).order("id").range(from, to)),
      fetchAllRows<{ id: number; nombre: string; apellidos: string; activo: boolean }>((from, to) =>
        client.from("docentes").select("id,nombre,apellidos,activo").eq("activo", true).order("id").range(from, to)),
      fetchAllRows<{ docente_id: number; coordinador_id: string }>((from, to) =>
        client.from("coordinated_teacher_assignments").select("docente_id,coordinador_id")
          .eq("cuatrimestre_id", cycleId).is("revoked_at", null).order("id").range(from, to)),
      fetchAllRows<{ docente_id: number; submitted_by: string }>((from, to) =>
        client.from("instrument_submissions").select("docente_id,submitted_by")
          .eq("cuatrimestre_id", cycleId).eq("purpose", "coordination").order("id").range(from, to)),
      scoresByTeacher(client, cycleId),
      previousCycle ? scoresByTeacher(client, previousCycle.id) : Promise.resolve(new Map<number, ScoreRow>()),
    ]);
    for (const result of [groups, schedules, teachers, assignments, coordinations]) if (result.error) throw result.error;

    const coordinatorIds = [...new Set((assignments.data || []).map((row) => row.coordinador_id))];
    const { data: coordinatorUsers } = coordinatorIds.length
      ? await client.from("usuarios").select("id,email").in("id", coordinatorIds)
      : { data: [] as Array<{ id: string; email: string }> };
    const emailById = new Map((coordinatorUsers || []).map((user: any) => [String(user.id), String(user.email)]));

    // Several coordinators may be assigned; prefer the ones who actually evaluated the teacher.
    const evaluators = new Map<number, Set<string>>();
    for (const row of coordinations.data || []) {
      evaluators.set(row.docente_id, (evaluators.get(row.docente_id) || new Set()).add(row.submitted_by));
    }
    const coordinatorsOf = (docenteId: number): string[] => {
      const assigned = (assignments.data || []).filter((row) => row.docente_id === docenteId).map((row) => row.coordinador_id);
      const evaluated = assigned.filter((id) => evaluators.get(docenteId)?.has(id));
      return (evaluated.length ? evaluated : assigned).map((id) => emailById.get(id)).filter((email): email is string => !!email);
    };

    const startsByGroup = new Map<number, string[]>();
    for (const row of schedules.data || []) startsByGroup.set(row.grupo_id, [...(startsByGroup.get(row.grupo_id) || []), row.hora_inicio]);
    const groupsByTeacher = new Map<number, typeof groups.data>();
    for (const group of groups.data || []) groupsByTeacher.set(group.docente_id, [...(groupsByTeacher.get(group.docente_id) || []), group]);

    const previousIds = [...previous.keys()];
    const autoPoints = new Map<number, number>();
    if (previousCycle && previousIds.length) {
      const diagnostics = await fetchAllRows<{ docente_id: number; puntaje_total: number | null }>((from, to) =>
        client.from("autodiagnosticos").select("id,docente_id,puntaje_total")
          .eq("cuatrimestre_id", previousCycle.id).order("id", { ascending: false }).range(from, to));
      if (diagnostics.error) throw diagnostics.error;
      for (const row of diagnostics.data || []) {
        if (!autoPoints.has(row.docente_id) && row.puntaje_total != null) autoPoints.set(row.docente_id, Number(row.puntaje_total));
      }
    }

    // The previous-cycle block only appears when that cycle has results to show.
    const includePrevious = !!previousCycle && previous.size > 0;
    const rows = (teachers.data || [])
      .filter((teacher) => groupsByTeacher.has(teacher.id))
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, "es-MX"))
      .map((teacher) => {
        const own = groupsByTeacher.get(teacher.id) || [];
        const offers = [...new Set(own.map((group) => group.plan_normalizado).filter((plan): plan is string => !!plan))].join(" / ");
        const shifts = [...new Set(own.flatMap((group) => {
          const shift = deriveShift(group.turno_grupo, startsByGroup.get(group.id) || []);
          return shift ? shift.split(" / ") : [];
        }))].sort().join(" / ");
        const coordinators = coordinatorsOf(teacher.id);
        return format360Row({
          name: formatPersonName(`${teacher.nombre} ${teacher.apellidos}`.trim()),
          offers,
          shift: shifts,
          coordinatorEmail: coordinators.join(" / "),
          coordinatorName: coordinators.map(nameFromEmail).join(" / "),
          current: current.get(teacher.id),
          previous: previous.get(teacher.id),
          previousAutoPoints: autoPoints.get(teacher.id) ?? null,
        }, includePrevious);
      });

    const csv = toCsv([format360Headers(String(cycle.clave), includePrevious ? String(previousCycle?.clave) : null), ...rows]);
    const safeKey = String(cycle.clave).replace(/[^A-Za-z0-9_-]/g, "_");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="formato_360_${safeKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin format 360 export] failed", error);
    return fail("Error interno", 500);
  }
};
