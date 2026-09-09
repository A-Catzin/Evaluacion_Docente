import type { APIRoute } from "astro";
import { authorizeSuperadmin, json } from "../../../lib/adminImport";
import {
  assignmentPayload,
  resolveImportIssueTarget,
  type ResolvedImportIssueTarget,
} from "../../../lib/importIssueReconciliation";
import { recalcularCalificacionDocente } from "../../../services/calificaciones";

const MAX_ISSUES = 100;

type ResolvedAction = {
  target: ResolvedImportIssueTarget;
  issueIds: number[];
  groupId: number | null;
};

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647
    ? value
    : null;
}

function importRunType(issue: any): string | null {
  const run = Array.isArray(issue.import_runs)
    ? issue.import_runs[0]
    : issue.import_runs;
  return typeof run?.tipo === "string" ? run.tipo : null;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const client = auth.client;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(
        {
          error: "Solicitud JSON inválida",
          code: "import_issue_assignment_invalid",
        },
        400,
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(
      {
        error: "Solicitud JSON inválida",
        code: "import_issue_assignment_invalid",
      },
      400,
    );
  }

  try {
    const cycleId = positiveInteger(body.cuatrimestre_id);
    const teacherId = positiveInteger(body.docente_id);
    const rawIssueIds = body.issue_ids;
    if (
      !cycleId ||
      !teacherId ||
      !Array.isArray(rawIssueIds) ||
      rawIssueIds.length === 0 ||
      rawIssueIds.length > MAX_ISSUES
    ) {
      return json(
        {
          error: "Ciclo, docente o incidencias inválidos",
          code: "import_issue_assignment_invalid",
        },
        400,
      );
    }

    const issueIds = rawIssueIds.map(positiveInteger);
    if (issueIds.some((id) => !id)) {
      return json(
        {
          error: "Las incidencias deben tener identificadores válidos",
          code: "import_issue_assignment_invalid",
        },
        400,
      );
    }
    const requestedIssueIds = issueIds as number[];
    if (new Set(requestedIssueIds).size !== requestedIssueIds.length) {
      return json(
        {
          error: "La selección contiene incidencias duplicadas",
          code: "import_issue_assignment_duplicate_issues",
        },
        400,
      );
    }

    const { data: teacher, error: teacherError } = await client
      .from("docentes")
      .select("id")
      .eq("id", teacherId)
      .eq("activo", true)
      .maybeSingle();
    if (teacherError)
      return json(
        {
          error: "No fue posible validar al docente",
          code: "import_issue_assignment_teacher_unavailable",
        },
        503,
      );
    if (!teacher)
      return json(
        {
          error: "El docente seleccionado no está activo o no existe",
          code: "import_issue_assignment_teacher_not_found",
        },
        404,
      );

    const { data: issues, error: issuesError } = await client
      .from("import_issues")
      .select(
        "id,cuatrimestre_id,plan,grupo,clave_asignatura,import_runs(tipo)",
      )
      .in("id", requestedIssueIds)
      .eq("resolution_status", "open");
    if (issuesError)
      return json(
        {
          error: "No fue posible validar las incidencias",
          code: "import_issue_assignment_scope_unavailable",
        },
        503,
      );
    if ((issues || []).length !== requestedIssueIds.length) {
      return json(
        {
          error: "Una o más incidencias ya no existen o ya fueron resueltas",
          code: "import_issue_assignment_issue_not_found",
        },
        404,
      );
    }
    if (
      (issues || []).some(
        (issue: any) =>
          issue.cuatrimestre_id !== cycleId ||
          importRunType(issue) !== "asignaciones",
      )
    ) {
      return json(
        {
          error:
            "Todas las incidencias deben pertenecer al ciclo y a una importación de asignaciones",
          code: "import_issue_assignment_scope_mismatch",
        },
        409,
      );
    }

    const [
      { data: groups, error: groupsError },
      { data: subjects, error: subjectsError },
    ] = await Promise.all([
      client
        .from("grupos")
        .select(
          "id,clave,cuatrimestre_id,docente_id,asignatura_id,num_alumnos,plan_normalizado,grado,grupo_normalizado,importacion_key",
        )
        .eq("cuatrimestre_id", cycleId)
        .eq("activo", true),
      client.from("asignaturas").select("id,clave"),
    ]);
    if (groupsError || subjectsError) {
      return json(
        {
          error: "No fue posible consultar grupos o asignaturas del ciclo",
          code: "import_issue_assignment_groups_unavailable",
        },
        503,
      );
    }

    const actionsByKey = new Map<string, ResolvedAction>();
    for (const issue of issues || []) {
      const target = resolveImportIssueTarget(
        cycleId,
        issue,
        groups || [],
        subjects || [],
      );
      if (!target.ok) {
        return json(
          {
            error:
              "La incidencia no puede conciliarse de forma segura; revise plan, grupo, grado y asignatura",
            code: target.code,
            issue_id: issue.id,
          },
          409,
        );
      }
      const action = actionsByKey.get(target.assignmentKey);
      if (action) {
        action.issueIds.push(issue.id);
      } else {
        actionsByKey.set(target.assignmentKey, {
          target,
          issueIds: [issue.id],
          groupId: target.existing?.id || null,
        });
      }
    }

    const actions = [...actionsByKey.values()];
    const existingActions = actions.filter((action) => action.groupId !== null);
    const existingGroupIds = [
      ...new Set(existingActions.map((action) => action.groupId as number)),
    ];
    const previousTeacherIds = new Set<number>(
      existingActions
        .map((action) => positiveInteger(action.target.existing?.docente_id))
        .filter((id): id is number => id !== null),
    );
    const noOpGroupCount = existingActions.filter(
      (action) => action.target.existing?.docente_id === teacherId,
    ).length;

    // Existing subject-assignment rows are updated together. Base rows never enter this list.
    if (existingGroupIds.length) {
      const { data: updatedGroups, error: updateError } = await client
        .from("grupos")
        .update({ docente_id: teacherId })
        .in("id", existingGroupIds)
        .eq("cuatrimestre_id", cycleId)
        .eq("activo", true)
        .select("id");
      if (
        updateError ||
        (updatedGroups || []).length !== existingGroupIds.length
      ) {
        return json(
          {
            error: "No fue posible guardar la asignación de grupos",
            code: "import_issue_assignment_persistence_failed",
          },
          503,
        );
      }
    }

    for (const action of actions.filter(
      (candidate) => candidate.groupId === null,
    )) {
      const { data: created, error: createError } = await client
        .from("grupos")
        .insert(assignmentPayload(cycleId, action.target, teacherId))
        .select("id")
        .maybeSingle();
      if (createError || !created) {
        return json(
          {
            error: "No fue posible crear el grupo de asignatura",
            code: "import_issue_assignment_persistence_failed",
          },
          503,
        );
      }
      action.groupId = created.id;

      const { data: enrollments, error: enrollmentsError } = await client
        .from("inscripciones")
        .select("estudiante_id,cuatrimestre_id")
        .in("grupo_id", action.target.baseIds)
        .eq("cuatrimestre_id", cycleId);
      if (enrollmentsError) {
        return json(
          {
            error:
              "El grupo fue creado, pero no se pudieron leer sus inscripciones",
            code: "import_issue_assignment_enrollments_unavailable",
          },
          503,
        );
      }
      if (enrollments?.length) {
        const enrollmentByStudent = new Map<number, any>();
        for (const enrollment of enrollments)
          enrollmentByStudent.set(enrollment.estudiante_id, {
            estudiante_id: enrollment.estudiante_id,
            grupo_id: created.id,
            cuatrimestre_id: enrollment.cuatrimestre_id,
          });
        const { error: enrollmentError } = await client
          .from("inscripciones")
          .upsert([...enrollmentByStudent.values()], {
            onConflict: "estudiante_id,grupo_id,cuatrimestre_id",
          });
        if (enrollmentError) {
          return json(
            {
              error:
                "El grupo fue creado, pero no se pudieron copiar sus inscripciones",
              code: "import_issue_assignment_enrollments_failed",
            },
            503,
          );
        }
      }
    }

    const recalculateTeacherIds = new Set([...previousTeacherIds, teacherId]);
    for (const docenteId of recalculateTeacherIds) {
      try {
        await recalcularCalificacionDocente(client, docenteId, cycleId);
      } catch (error) {
        console.error("[import_issue_assignment] recalculation failed", {
          cycleId,
          docenteId,
          error,
        });
        return json(
          {
            error:
              "Los grupos se asignaron, pero no fue posible recalcular las calificaciones docentes",
            code: "import_issue_assignment_recalculation_failed",
          },
          503,
        );
      }
    }

    for (const action of actions) {
      // RETURNING/SELECT may be filtered by RLS after an issue transitions from open to resolved.
      const { error: resolveError } = await client
        .from("import_issues")
        .update({
          resolution_status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: auth.userId,
          resolution_kind: "manual_teacher_assignment",
          resolved_group_id: action.groupId,
        })
        .in("id", action.issueIds)
        .eq("cuatrimestre_id", cycleId)
        .eq("resolution_status", "open");
      if (resolveError) {
        console.error("[import_issue_assignment] resolution update failed", {
          cycleId,
          issueIds: action.issueIds,
          expectedCount: action.issueIds.length,
          code: resolveError.code || null,
          message: resolveError.message || null,
          details: resolveError.details || null,
          hint: resolveError.hint || null,
        });
        return json(
          {
            error:
              "Los grupos se asignaron, pero no fue posible registrar la resolución de incidencias",
            code: "import_issue_assignment_resolution_failed",
          },
          503,
        );
      }
    }

    return json({
      success: true,
      assigned_issue_count: requestedIssueIds.length,
      assigned_group_count: actions.length,
      created_group_count: actions.filter((action) => !action.target.existing)
        .length,
      no_op_group_count: noOpGroupCount,
    });
  } catch {
    return json(
      { error: "Error interno", code: "import_issue_assignment_unexpected" },
      500,
    );
  }
};
