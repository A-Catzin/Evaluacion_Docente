import type { APIRoute } from "astro";
import { requireRole, AuthError } from "../../../lib/auth";
import { dbAdmin } from "../../../lib/db";
import { toCsv } from "../../../lib/csv";
import {
  fetchNativeStudentEvaluationScores,
  formatScoreCsv,
  type NativeStudentEvaluationScore,
} from "../../../services/scoring";
import { obtenerCalificacionesPorCuatrimestre } from "../../../services/calificaciones";
import {
  groupPlanningAssignmentsBySubjectName,
  normalizePlanningSubjectName,
  type PlanningSubjectAssignment,
} from "../../../lib/planningSubjectScope";
import { formatPersonName } from "../../../lib/personName";

type ExportAssignment = PlanningSubjectAssignment & {
  docenteId: number;
};

type ExportScore = {
  docente_id: number;
  score_encuesta_estudiantil: number | null;
  score_coordinacion: number | null;
  score_planeacion: number | null;
  score_observacion: number | null;
  score_autoevaluacion: number | null;
  calificacion_final: number | null;
  categoria_final: string | null;
  num_instrumentos_completados: number;
  num_instrumentos_esperados: number;
  has_invalid_instrument: boolean;
};

function averageAvailable(
  values: Array<number | undefined>,
): number | undefined {
  const available = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : undefined;
}

function weightedGroupScores(
  rows: NativeStudentEvaluationScore[],
): Map<number, number> {
  const totals = new Map<number, { score: number; responses: number }>();
  for (const row of rows) {
    if (row.respuestas_validas <= 0) continue;
    const current = totals.get(row.grupo_id) || { score: 0, responses: 0 };
    current.score += row.score_normalizado * row.respuestas_validas;
    current.responses += row.respuestas_validas;
    totals.set(row.grupo_id, current);
  }
  return new Map(
    [...totals].map(([groupId, total]) => [
      groupId,
      total.score / total.responses,
    ]),
  );
}

function planningForScope(
  scopeKey: string,
  plans: Array<{ asignaturaNombre: string; puntaje_promedio: number | null }>,
): number | undefined {
  return averageAvailable(
    plans
      .filter(
        (plan) =>
          normalizePlanningSubjectName(plan.asignaturaNombre) === scopeKey,
      )
      .map((plan) =>
        plan.puntaje_promedio == null
          ? undefined
          : Number(plan.puntaje_promedio),
      ),
  );
}

function buildTeacherRows(
  score: ExportScore,
  teacher: { nombre: string; apellidos: string; email: string },
  assignments: ExportAssignment[],
  plans: Array<{
    asignaturaNombre: string;
    puntaje_promedio: number | null;
    estado: string;
  }>,
  nativeRows: NativeStudentEvaluationScore[],
): unknown[][] {
  const teacherName = formatPersonName(
    `${teacher.nombre} ${teacher.apellidos}`.trim(),
  );
  const scopes = groupPlanningAssignmentsBySubjectName(assignments);
  const groupScores = weightedGroupScores(nativeRows);
  const common = (
    ee: number | undefined,
    planning: string,
    planningState: string,
    group: string,
    subject: string,
  ) => [
    teacherName,
    teacher.email,
    group,
    subject,
    formatScoreCsv(ee),
    formatScoreCsv(score.score_coordinacion),
    planning,
    planningState,
    formatScoreCsv(score.score_observacion),
    formatScoreCsv(score.score_autoevaluacion),
    formatScoreCsv(score.calificacion_final),
    score.has_invalid_instrument ? "Inválido por exceso de N/A" : "Válido",
    score.categoria_final || "No iniciado",
    `${score.num_instrumentos_completados}/${score.num_instrumentos_esperados}`,
  ];

  if (!scopes.length) {
    return [
      common(
        undefined,
        score.score_planeacion == null
          ? "NP"
          : formatScoreCsv(score.score_planeacion),
        score.score_planeacion == null ? "NP" : "Aprobada",
        "—",
        "—",
      ),
    ];
  }

  return scopes.flatMap((scope) => {
    const plan = planningForScope(scope.key, plans);
    // The export intentionally treats an undelivered planning as NP. This is a
    // reporting convention; it does not mutate the planning status in Supabase.
    const planning = plan == null ? "NP" : formatScoreCsv(plan);
    const planningState = plan == null ? "NP" : "Aprobada";
    return scope.assignments.map((assignment) =>
      common(
        assignment.grupoId == null
          ? undefined
          : groupScores.get(assignment.grupoId),
        planning,
        planningState,
        assignment.grupo || "—",
        scope.nombre,
      ),
    );
  });
}

export const GET: APIRoute = async ({ cookies, url }) => {
  try {
    await requireRole(cookies, ["superadmin"]);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response("Error interno", { status: 500 });
  }

  const cuatrimestreId = Number.parseInt(
    url.searchParams.get("cuatrimestre_id") || "",
    10,
  );
  if (!Number.isSafeInteger(cuatrimestreId) || cuatrimestreId <= 0) {
    return new Response(
      JSON.stringify({ error: "cuatrimestre_id válido requerido" }),
      { status: 400 },
    );
  }

  try {
    const client = dbAdmin();
    const { data: cycle, error: cycleError } = await client
      .from("cuatrimestres")
      .select("id,clave")
      .eq("id", cuatrimestreId)
      .maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle)
      return new Response(JSON.stringify({ error: "Ciclo no encontrado" }), {
        status: 404,
      });

    // Authorization is session-scoped, but report data must use the same admin
    // read path as /admin/resultados-docentes so RLS cannot produce an empty CSV.
    const aggregateRows = (await obtenerCalificacionesPorCuatrimestre(
      client,
      cuatrimestreId,
    )) as ExportScore[];
    const scores = aggregateRows.filter(
      (score) => score.num_instrumentos_completados > 0,
    );
    const teacherIds = [
      ...new Set(
        scores
          .map((score) => Number(score.docente_id))
          .filter(Number.isSafeInteger),
      ),
    ];

    const [teachersResult, assignmentsResult, plansResult, nativeRows] =
      await Promise.all([
        teacherIds.length
          ? client
              .from("docentes")
              .select("id,nombre,apellidos,email")
              .in("id", teacherIds)
              .eq("activo", true)
              .order("apellidos")
          : Promise.resolve({ data: [], error: null }),
        teacherIds.length
          ? client
              .from("grupos")
              .select(
                "id,clave,docente_id,asignatura_id,modalidad,asignaturas!inner(nombre)",
              )
              .eq("cuatrimestre_id", cuatrimestreId)
              .eq("activo", true)
              .in("docente_id", teacherIds)
          : Promise.resolve({ data: [], error: null }),
        teacherIds.length
          ? client
              .from("planeaciones")
              .select(
                "docente_id,puntaje_promedio,estado,asignaturas!inner(nombre)",
              )
              .eq("cuatrimestre_id", cuatrimestreId)
              .eq("estado", "Aprobado")
              .in("docente_id", teacherIds)
          : Promise.resolve({ data: [], error: null }),
        fetchNativeStudentEvaluationScores(client, cuatrimestreId),
      ]);
    for (const result of [teachersResult, assignmentsResult, plansResult]) {
      if (result.error) throw result.error;
    }

    const teachersById = new Map(
      (teachersResult.data || []).map((teacher: any) => [
        Number(teacher.id),
        teacher,
      ]),
    );
    const rows = scores
      .filter((score) => teachersById.has(Number(score.docente_id)))
      .sort((left, right) => {
        const a = teachersById.get(Number(left.docente_id));
        const b = teachersById.get(Number(right.docente_id));
        return `${a?.apellidos || ""} ${a?.nombre || ""}`.localeCompare(
          `${b?.apellidos || ""} ${b?.nombre || ""}`,
          "es-MX",
        );
      })
      .flatMap((score) => {
        const docenteId = Number(score.docente_id);
        const teacher = teachersById.get(docenteId)!;
        const assignments = (assignmentsResult.data || [])
          .filter(
            (assignment: any) =>
              Number(assignment.docente_id) === docenteId &&
              assignment.asignaturas?.nombre,
          )
          .map((assignment: any) => ({
            docenteId,
            grupoId: Number(assignment.id),
            asignaturaId: Number(assignment.asignatura_id),
            asignaturaNombre: String(assignment.asignaturas.nombre),
            grupo: String(assignment.clave || ""),
            modalidad: assignment.modalidad,
          }));
        const plans = (plansResult.data || [])
          .filter(
            (plan: any) =>
              Number(plan.docente_id) === docenteId && plan.asignaturas?.nombre,
          )
          .map((plan: any) => ({
            asignaturaNombre: String(plan.asignaturas.nombre),
            puntaje_promedio:
              plan.puntaje_promedio == null
                ? null
                : Number(plan.puntaje_promedio),
            estado: String(plan.estado || ""),
          }));
        const nativeForTeacher = nativeRows.filter(
          (row) => Number(row.docente_id) === docenteId,
        );
        return buildTeacherRows(
          score,
          teacher,
          assignments,
          plans,
          nativeForTeacher,
        );
      });

    const csv = toCsv([
      [
        "Docente",
        "Correo",
        "Grupo",
        "Asignatura",
        "Evaluación estudiantil",
        "Coordinación",
        "Planeación",
        "Estado planeación",
        "Observación",
        "Autodiagnóstico",
        "Calificación final docente",
        "Estado",
        "Categoría",
        "Instrumentos",
      ],
      ...rows,
    ]);
    const safeKey = String(cycle.clave).replace(/[^A-Za-z0-9_-]/g, "_");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="resultados_${safeKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin results export] failed", error);
    return new Response("Error interno", { status: 500 });
  }
};
