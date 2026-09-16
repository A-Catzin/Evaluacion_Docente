import { createHash, randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { authorizeSuperadmin, json } from "../../../lib/adminImport";
import {
  parseAssignmentSyncCsv,
  planAssignmentImportSync,
  type AssignmentSyncAction,
} from "../../../lib/assignmentImportSync";
import { obtenerClienteAdmin } from "../../../lib/supabaseClient";
import { ImportFormSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

const ASSIGNMENT_SYNC_VERSION = "set-based-v10";

type RpcFailure = { message?: string; code?: string };

type RpcTiming = {
  correlationId: string;
  cycleId: number;
  elapsedMs: number;
};

function rpcDiagnosticHint(error: RpcFailure) {
  const message = error.message || "";
  if (error.code === "55P03" || /lock timeout/i.test(message))
    return "El RPC agotó la espera de bloqueo; revise los marcadores assignment_import del ciclo en los logs de base de datos.";
  if (error.code === "40P01" || /deadlock/i.test(message))
    return "El RPC detectó un interbloqueo; revise los marcadores assignment_import del ciclo antes de volver a intentar.";
  if (
    error.code === "57014" ||
    /statement timeout|elapsed budget|timed out/i.test(message)
  )
    return "El RPC agotó su presupuesto de tiempo; el último marcador assignment_import en los logs identifica la fase alcanzada.";
  return "La respuesta del RPC no confirma si la transacción terminó; use el identificador de correlación para revisar los logs antes de reintentar.";
}

function rpcApplyFailure(error: RpcFailure, timing: RpcTiming) {
  const message = error.message || "fallo desconocido del RPC";
  if (error.code === "40001")
    return json(
      {
        error:
          "La propuesta cambió antes de aplicarse. Genere una nueva vista previa.",
        applyStatus: "conflict",
        recalculationStatus: "not_started",
      },
      409,
    );

  const isTimeout =
    error.code === "57014" ||
    /\b(?:upstream\s+request\s+)?timeout\b|timed\s+out/i.test(message);
  console.error("[assignment-import] RPC invocation failed", {
    ...timing,
    errorCode: error.code || null,
    errorMessage: message,
  });
  return json(
    {
      error: `No se pudo confirmar la sincronización: ${message}`,
      // A gateway/RPC failure can arrive after the database has committed, so the
      // caller must use the import report rather than retrying blindly.
      applyStatus: "unknown",
      recalculationStatus: "unknown",
      correlationId: timing.correlationId,
      diagnosticHint: rpcDiagnosticHint(error),
    },
    isTimeout ? 504 : 503,
  );
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function previewSignature(
  cycleId: number,
  fileHash: string,
  actions: AssignmentSyncAction[],
) {
  // Apply reparses and resolves every value again, so sign every database-derived
  // field that can affect the atomic RPC instead of only the target identifiers.
  return digest(
    JSON.stringify({
      cycleId,
      fileHash,
      actions: actions.map((action) => ({
        assignmentKey: action.assignmentKey,
        plan: action.plan,
        grade: action.grade,
        group: action.group,
        subjectKey: action.subjectKey,
        subjectId: action.subjectId,
        teacherId: action.teacherId,
        previousTeacherId: action.previousTeacherId,
        existingGroupId: action.existingGroupId,
        baseIds: action.baseIds,
        baseKey: action.baseKey,
        numAlumnos: action.numAlumnos,
        issueCount: action.issueCount,
        kind: action.kind,
      })),
    }),
  );
}

async function proposalFor(client: any, cycleId: number, text: string) {
  const [
    { data: cycle, error: cycleError },
    { data: teachers, error: teachersError },
    { data: subjects, error: subjectsError },
    { data: groups, error: groupsError },
    { data: openIssues, error: issuesError },
  ] = await Promise.all([
    client
      .from("cuatrimestres")
      .select("id,clave,nombre")
      .eq("id", cycleId)
      .maybeSingle(),
    client
      .from("docentes")
      .select("id,nombre,apellidos,email,num_empleado,activo"),
    client.from("asignaturas").select("id,clave,nombre"),
    client
      .from("grupos")
      .select(
        "id,clave,cuatrimestre_id,docente_id,asignatura_id,num_alumnos,plan_normalizado,grado,grupo_normalizado,importacion_key",
      )
      .eq("cuatrimestre_id", cycleId)
      .eq("activo", true),
    client
      .from("import_issues")
      .select("id,plan,grupo,clave_asignatura,import_runs!inner(tipo)")
      .eq("cuatrimestre_id", cycleId)
      .eq("resolution_status", "open")
      .eq("import_runs.tipo", "asignaciones"),
  ]);
  const error =
    cycleError || teachersError || subjectsError || groupsError || issuesError;
  if (error) throw new Error(error.message);
  if (!cycle) return { cycle: null, proposal: null };
  const parsed = parseAssignmentSyncCsv(text);
  return {
    cycle,
    proposal: planAssignmentImportSync({
      cycleId,
      rows: parsed.rows,
      initialBlockers: parsed.blockers,
      teachers: teachers || [],
      subjects: subjects || [],
      groups: groups || [],
      openIssues: openIssues || [],
    }),
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let mode: string | null;
  try {
    mode = new URL(request.url).searchParams.get("mode");
  } catch {
    return json({ error: "URL de solicitud inválida" }, 400);
  }
  if (mode !== "preview" && mode !== "apply")
    return json({ error: "Modo de importación inválido" }, 400);
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const correlationId = randomUUID();
  let requestPhase = "form_parse";

  try {
    const formData = await request.formData();
    const parsedForm = ImportFormSchema.safeParse({
      file: formData.get("file"),
      cuatrimestre_id: formData.get("cuatrimestre_id"),
    });
    if (!parsedForm.success)
      return json(
        {
          error: "Archivo o ciclo inválido",
          detalles: formatZodFieldErrors(parsedForm.error),
        },
        400,
      );
    const { file, cuatrimestre_id: cycleId } = parsedForm.data;
    if (file.size > 25 * 1024 * 1024)
      return json({ error: "El archivo no debe superar 25 MB" }, 400);

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const fileHash = digest(text);
    // The role check authorizes the request; the snapshot must still use the
    // privileged read client so RLS cannot hide existing cycle-11 groups.
    requestPhase = "proposal_snapshot";
    const snapshotStartedAt = Date.now();
    console.info("[assignment-import] proposal snapshot started", {
      correlationId,
      cycleId,
      mode,
    });
    const snapshotClient = obtenerClienteAdmin();
    const resolved = await proposalFor(snapshotClient, cycleId, text);
    console.info("[assignment-import] proposal snapshot completed", {
      correlationId,
      cycleId,
      mode,
      elapsedMs: Date.now() - snapshotStartedAt,
      actions: resolved.proposal?.actions.length ?? 0,
    });
    if (!resolved.cycle || !resolved.proposal)
      return json({ error: "El ciclo seleccionado no existe" }, 400);
    const signature = previewSignature(
      cycleId,
      fileHash,
      resolved.proposal.actions,
    );
    if (mode === "preview")
      return json({
        success: true,
        mode,
        syncVersion: ASSIGNMENT_SYNC_VERSION,
        cycle: { id: resolved.cycle.id, clave: resolved.cycle.clave },
        fileHash,
        previewSignature: signature,
        rowsRead: resolved.proposal.rowsRead,
        summary: resolved.proposal.summary,
        blockers: resolved.proposal.blockers,
        warnings: resolved.proposal.warnings,
        actions: resolved.proposal.actions.map((action) => ({
          row: action.row,
          rows: action.rows,
          kind: action.kind,
          group: action.group,
          subjectKey: action.subjectKey,
          teacher: action.teacherLabel,
          teacherId: action.teacherId,
          previousTeacherId: action.previousTeacherId,
          issueCount: action.issueCount,
          subjectAction: action.subjectAction,
          groupAction: action.groupAction,
        })),
      });

    if (
      formData.get("file_hash") !== fileHash ||
      formData.get("preview_signature") !== signature
    ) {
      return json(
        {
          error:
            "La vista previa ya no corresponde al archivo o al estado actual. Genere una nueva vista previa.",
        },
        409,
      );
    }
    if (resolved.proposal.blockers.length)
      return json(
        {
          error: "La propuesta tiene bloqueadores y no puede aplicarse.",
          blockers: resolved.proposal.blockers,
          warnings: resolved.proposal.warnings,
        },
        409,
      );

    // The RPC checks superadmin authorization again, locks the cycle, and repeats all
    // persistence-critical identity checks in the same transaction as its writes.
    requestPhase = "rpc_apply";
    const rpcStartedAt = Date.now();
    console.info("[assignment-import] RPC invocation started", {
      correlationId,
      cycleId,
      actions: resolved.proposal.actions.length,
      rowsRead: resolved.proposal.rowsRead,
    });
    const { data, error } = await auth.client.rpc(
      "apply_assignment_import_sync",
      {
        p_cuatrimestre_id: cycleId,
        p_archivo_nombre: file.name,
        p_filas_leidas: resolved.proposal.rowsRead,
        p_resumen: {
          ...resolved.proposal.summary,
          warnings: resolved.proposal.warnings,
        },
        p_actions: resolved.proposal.actions.map((action) => ({
          assignment_key: action.assignmentKey,
          plan: action.plan,
          grade: action.grade,
          group_name: action.group,
          subject_key: action.subjectKey,
          subject_name: action.subjectName,
          teacher_id: action.teacherId,
          existing_group_id: action.existingGroupId,
          previous_teacher_id: action.previousTeacherId,
          base_ids: action.baseIds,
          base_key: action.baseKey,
          num_alumnos: action.numAlumnos,
        })),
      },
    );
    const rpcElapsedMs = Date.now() - rpcStartedAt;
    console.info("[assignment-import] RPC invocation completed", {
      correlationId,
      cycleId,
      elapsedMs: rpcElapsedMs,
      outcome: error ? "error" : "ok",
    });
    if (error)
      return rpcApplyFailure(error, {
        correlationId,
        cycleId,
        elapsedMs: rpcElapsedMs,
      });

    const result = (data || {}) as {
      runId?: number;
      issuesCleaned?: number;
      subjectsCreated?: number;
      groupsCreated?: number;
      affectedTeacherIds?: number[];
    };
    // The import committed, but recalculation is intentionally deferred. Running a
    // per-teacher loop here can exceed the HTTP deadline and must not make this
    // already-committed import look like a failed apply.
    const affectedTeacherIds = [...new Set(result.affectedTeacherIds || [])];
    const recalculationStatus = affectedTeacherIds.length
      ? "pending"
      : "not_required";
    return json({
      success: true,
      mode,
      correlationId,
      syncVersion: ASSIGNMENT_SYNC_VERSION,
      applyStatus: "committed",
      runId: result.runId,
      cycle: { id: resolved.cycle.id, clave: resolved.cycle.clave },
      rowsRead: resolved.proposal.rowsRead,
      summary: {
        ...resolved.proposal.summary,
        subjectsCreated:
          result.subjectsCreated ?? resolved.proposal.summary.subjectsCreated,
        groupsCreated:
          result.groupsCreated ?? resolved.proposal.summary.groupsCreated,
        issuesCleaned: result.issuesCleaned ?? 0,
      },
      warnings: resolved.proposal.warnings,
      actions: resolved.proposal.actions,
      issuesResolved: result.issuesCleaned ?? 0,
      affectedTeacherIds,
      recalculationStatus,
      recalculationPendingTeacherIds: affectedTeacherIds,
      recalculationErrors: [],
      reportUrl: result.runId
        ? `/api/admin/import-report?run_id=${result.runId}`
        : null,
    });
  } catch (error) {
    console.error("[assignment-import] request failed", {
      correlationId,
      phase: requestPhase,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno al importar asignaciones",
      },
      500,
    );
  }
};
