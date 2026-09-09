import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import {
  authorizeSuperadmin,
  finishImportRun,
  json,
  saveImportIssues,
} from "../../../lib/adminImport";
import { recalcularCalificacionesCuatrimestre } from "../../../services/calificaciones";
import {
  chunks,
  findColumn,
  normalizeEmployeeNumber,
  normalizeText,
  parseCsv,
} from "../../../lib/importCsv";
import { ImportFormSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";
import {
  startImportAudit,
  type ImportAudit,
} from "../../../lib/auditChangeSet";
import {
  assignmentImportKey,
  baseImportedGroup,
  normalizeImportedGroup,
  normalizeImportedPlan,
} from "../../../lib/groupImportIdentity";
import { revalidateOpenAssignmentIssues } from "../../../lib/importIssueReconciliation";
import { selectCanonicalEquivalentBaseCandidate } from "../../../lib/groupImportResolution";
import {
  parseAssignmentSyncCsv,
  planAssignmentImportSync,
  type AssignmentSyncAction,
} from "../../../lib/assignmentImportSync";
import { recalcularCalificacionDocente } from "../../../services/calificaciones";

const ASSIGNMENT_SYNC_VERSION = "canonical-base-v3";

type ClassRow = {
  row: number;
  plan: string;
  group: string;
  groupId: string;
  subjectKey: string;
  subjectName: string;
  teacher: string;
  teacherEmail: string;
  teacherEmployee: string;
};

type Issue = Record<string, unknown>;

function issue(
  row: ClassRow,
  reason: string,
  normalized: string,
  details: Record<string, unknown> = {},
): Issue {
  const category = reason.startsWith("docente")
    ? "docente"
    : reason.startsWith("asignatura")
      ? "asignatura"
      : reason.startsWith("grupo")
        ? "grupo"
        : "fila";
  return {
    categoria: category,
    razon: reason,
    fila: row.row,
    valor_original:
      category === "docente"
        ? row.teacher
        : category === "asignatura"
          ? row.subjectKey
          : row.group,
    valor_normalizado: normalized || null,
    plan: row.plan || null,
    grupo: row.group || null,
    clave_asignatura: row.subjectKey || null,
    nombre_asignatura: row.subjectName || null,
    docente: row.teacher || null,
    detalles: details,
  };
}

function groupDiagnosticDetails(
  cycleId: number,
  plan: string,
  group: string,
  groupList: any[],
  candidates: any[],
  baseCandidates: any[],
  fallbackUsed: boolean,
  details: Record<string, unknown> = {},
) {
  return {
    ...details,
    cycleId,
    normalizedPlan: plan,
    normalizedGroup: group,
    activeGroupListCount: groupList.length,
    candidateIds: candidates.map((candidate) => candidate.id),
    candidateCount: candidates.length,
    baseCandidateIds: baseCandidates.map((candidate) => candidate.id),
    baseCandidateCount: baseCandidates.length,
    fallbackUsed,
  };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function previewSignature(
  cycleId: number,
  fileHash: string,
  actions: AssignmentSyncAction[],
) {
  // The browser receives this only as a freshness token. Apply reparses the file and
  // regenerates every server-resolved ID; no browser teacher or group ID is trusted.
  return digest(
    JSON.stringify({
      cycleId,
      fileHash,
      actions: actions.map((action) => ({
        assignmentKey: action.assignmentKey,
        kind: action.kind,
        subjectId: action.subjectId,
        teacherId: action.teacherId,
        existingGroupId: action.existingGroupId,
        previousTeacherId: action.previousTeacherId,
        baseIds: action.baseIds,
      })),
    }),
  );
}

async function syncImport(
  request: Request,
  cookies: Parameters<APIRoute>[0]["cookies"],
  mode: "preview" | "apply",
) {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const client = auth.client;
  const formData = await request.formData();
  const formParse = ImportFormSchema.safeParse({
    file: formData.get("file"),
    cuatrimestre_id: formData.get("cuatrimestre_id"),
  });
  if (!formParse.success)
    return json(
      {
        error: "Archivo o ciclo inválido",
        detalles: formatZodFieldErrors(formParse.error),
      },
      400,
    );
  const { file, cuatrimestre_id: cycleId } = formParse.data;
  if (file.size > 25 * 1024 * 1024)
    return json({ error: "El archivo no debe superar 25 MB" }, 400);

  const text = (await file.text()).replace(/^\uFEFF/, "");
  const fileHash = digest(text);
  const [
    { data: cycle },
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
  if (!cycle) return json({ error: "El ciclo seleccionado no existe" }, 400);
  if (teachersError || subjectsError || groupsError || issuesError)
    return json(
      {
        error: `No se pudo preparar la conciliación: ${teachersError?.message || subjectsError?.message || groupsError?.message || issuesError?.message}`,
      },
      503,
    );

  const parsed = parseAssignmentSyncCsv(text);
  const proposal = planAssignmentImportSync({
    cycleId,
    rows: parsed.rows,
    initialBlockers: parsed.blockers,
    teachers: teachers || [],
    subjects: subjects || [],
    groups: groups || [],
    openIssues: openIssues || [],
  });
  const signature = previewSignature(cycleId, fileHash, proposal.actions);
  if (mode === "preview")
    return json({
      success: true,
      mode,
      syncVersion: ASSIGNMENT_SYNC_VERSION,
      cycle: { id: cycle.id, clave: cycle.clave },
      fileHash,
      previewSignature: signature,
      rowsRead: proposal.rowsRead,
      summary: proposal.summary,
      blockers: proposal.blockers,
      warnings: proposal.warnings,
      actions: proposal.actions.map((action) => ({
        row: action.row,
        rows: action.rows,
        kind: action.kind,
        group: action.group,
        subjectKey: action.subjectKey,
        teacher: action.teacherLabel,
        previousTeacherId: action.previousTeacherId,
        teacherId: action.teacherId,
        issueCount: action.issueCount,
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
  if (proposal.blockers.length)
    return json(
      {
        error: "La propuesta tiene bloqueadores y no puede aplicarse.",
        blockers: proposal.blockers,
      },
      409,
    );

  const { data, error } = await client.rpc("apply_assignment_import_sync", {
    p_cuatrimestre_id: cycleId,
    p_archivo_nombre: file.name,
    p_filas_leidas: proposal.rowsRead,
    p_resumen: proposal.summary,
    p_actions: proposal.actions.map((action) => ({
      assignment_key: action.assignmentKey,
      plan: action.plan,
      grade: action.grade,
      group_name: action.group,
      subject_key: action.subjectKey,
      subject_id: action.subjectId,
      teacher_id: action.teacherId,
      previous_teacher_id: action.previousTeacherId,
      existing_group_id: action.existingGroupId,
      base_ids: action.baseIds,
      base_key: action.baseKey,
      num_alumnos: action.numAlumnos,
    })),
  });
  if (error)
    return json(
      { error: `No se pudo aplicar la sincronización: ${error.message}` },
      503,
    );

  const affectedTeacherIds = [
    ...new Set(
      proposal.actions
        .flatMap((action) => [action.teacherId, action.previousTeacherId])
        .filter((id): id is number => id !== null),
    ),
  ];
  const recalculationErrors: string[] = [];
  for (const teacherId of affectedTeacherIds) {
    try {
      await recalcularCalificacionDocente(client, teacherId, cycleId);
    } catch (error) {
      recalculationErrors.push(
        `docente ${teacherId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const result = (data || {}) as { runId?: number; issuesResolved?: number };
  return json({
    success: true,
    mode,
    syncVersion: ASSIGNMENT_SYNC_VERSION,
    runId: result.runId,
    cycle: { id: cycle.id, clave: cycle.clave },
    ...proposal.summary,
    issuesResolved: result.issuesResolved ?? proposal.summary.issuesToResolve,
    recalculationErrors,
    reportUrl: result.runId
      ? `/api/admin/import-report?run_id=${result.runId}`
      : null,
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let mode: string | null = null;
  try {
    mode = new URL(request.url).searchParams.get("mode");
  } catch {
    return json({ error: "URL de solicitud inválida" }, 400);
  }
  if (mode === "preview" || mode === "apply")
    return syncImport(request, cookies, mode);
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const client = auth.client;
  let audit: ImportAudit | null = null;

  try {
    const formData = await request.formData();
    const formParse = ImportFormSchema.safeParse({
      file: formData.get("file"),
      cuatrimestre_id: formData.get("cuatrimestre_id"),
    });
    if (!formParse.success) {
      return json(
        {
          error: "Archivo o ciclo inválido",
          detalles: formatZodFieldErrors(formParse.error),
        },
        400,
      );
    }
    const { file, cuatrimestre_id: cycleId } = formParse.data;
    if (file.size > 25 * 1024 * 1024)
      return json({ error: "El archivo no debe superar 25 MB" }, 400);

    const { data: cycle } = await client
      .from("cuatrimestres")
      .select("id,clave,nombre")
      .eq("id", cycleId)
      .maybeSingle();
    if (!cycle) return json({ error: "El ciclo seleccionado no existe" }, 400);
    audit = await startImportAudit({
      client,
      source: "admin.import.asignaciones",
      cycleId,
      file,
    });
    const { data: run, error: runError } = await client
      .from("import_runs")
      .insert({
        tipo: "asignaciones",
        cuatrimestre_id: cycleId,
        archivo_nombre: file.name,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (runError || !run) {
      await audit.fail("inicio_importacion_fallido");
      return json(
        {
          error: `No se pudo iniciar la importación: ${runError?.message || "sin identificador"}`,
        },
        500,
      );
    }

    const records = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
    if (records.length < 2) {
      const finding = {
        categoria: "fila",
        razon: "archivo_vacio",
        fila: 1,
        valor_original: file.name,
        valor_normalizado: null,
        cuatrimestre_id: cycleId,
        ciclo: cycle.clave,
      };
      await saveImportIssues(client, run.id, [finding]);
      await finishImportRun(client, run.id, { rowsRead: 0, issues: 1 });
      await audit.fail("archivo_vacio", {
        rowsRead: 0,
        issues: 1,
        import_run_id: run.id,
      });
      return json(
        { error: "CSV vacío o sin filas de datos", runId: run.id, issues: 1 },
        400,
      );
    }
    const headers = records[0];
    const columns = {
      plan: findColumn(headers, "Plan de Estudios", "PLAN DE ESTUDIOS"),
      group: findColumn(headers, "Grupo"),
      groupId: findColumn(headers, "ID del grupo"),
      subjectKey: findColumn(headers, "Clave", "CLAVE"),
      subjectName: findColumn(headers, "Clase", "Nombre de la clase"),
      teacher: findColumn(headers, "Docente", "Nombre del docente"),
      teacherEmail: findColumn(
        headers,
        "Correo del docente",
        "Correo docente",
        "Email docente",
      ),
      teacherEmployee: findColumn(
        headers,
        "Número de empleado",
        "Numero de empleado",
        "Num empleado",
      ),
    };
    if (
      columns.plan < 0 ||
      columns.group < 0 ||
      columns.subjectKey < 0 ||
      columns.subjectName < 0 ||
      columns.teacher < 0
    ) {
      const finding = {
        categoria: "fila",
        razon: "contrato_invalido",
        fila: 1,
        valor_original: headers.join(", "),
        valor_normalizado: null,
        cuatrimestre_id: cycleId,
        ciclo: cycle.clave,
        detalles: {
          required: "Plan de Estudios, Grupo, Clave, Clase y Docente",
        },
      };
      await saveImportIssues(client, run.id, [finding]);
      await finishImportRun(client, run.id, {
        rowsRead: records.length - 1,
        issues: 1,
        contractError: true,
      });
      await audit.fail("contrato_invalido", {
        rowsRead: records.length - 1,
        issues: 1,
        import_run_id: run.id,
      });
      return json(
        {
          error:
            "Contrato inválido: se requieren Plan de Estudios, Grupo, Clave, Clase y Docente.",
          runId: run.id,
          issues: 1,
        },
        400,
      );
    }
    const value = (values: string[], column: number) =>
      column >= 0 ? (values[column] || "").trim() : "";
    const rows: ClassRow[] = records.slice(1).map((values, offset) => ({
      row: offset + 2,
      plan: value(values, columns.plan),
      group: baseImportedGroup(value(values, columns.group)),
      groupId: value(values, columns.groupId),
      subjectKey: normalizeText(value(values, columns.subjectKey)),
      subjectName: normalizeText(value(values, columns.subjectName)),
      teacher: normalizeText(value(values, columns.teacher)),
      teacherEmail: value(values, columns.teacherEmail).toLowerCase(),
      teacherEmployee: normalizeEmployeeNumber(
        value(values, columns.teacherEmployee),
      ),
    }));
    const issues: Issue[] = [];
    const validRows = rows.filter((row) => {
      if (!row.plan || !row.group || !row.subjectKey || !row.subjectName) {
        issues.push(
          issue(
            row,
            "fila_incompleta",
            `${row.plan}|${row.group}|${row.subjectKey}`,
          ),
        );
        return false;
      }
      return true;
    });

    const { data: teachers, error: teachersError } = await client
      .from("docentes")
      .select("id,nombre,apellidos,email,num_empleado,activo");
    if (teachersError)
      throw new Error(`No se pudo leer docentes: ${teachersError.message}`);
    const teacherByEmail = new Map<string, any[]>();
    const teacherByEmployee = new Map<string, any[]>();
    const teacherByName = new Map<string, any[]>();
    for (const teacher of teachers || []) {
      const nameKeys = new Set([
        normalizeText(`${teacher.nombre} ${teacher.apellidos}`),
        normalizeText(`${teacher.apellidos} ${teacher.nombre}`),
      ]);
      for (const fullName of nameKeys)
        teacherByName.set(fullName, [
          ...(teacherByName.get(fullName) || []),
          teacher,
        ]);
      if (teacher.email)
        teacherByEmail.set(String(teacher.email).trim().toLowerCase(), [
          ...(teacherByEmail.get(String(teacher.email).trim().toLowerCase()) ||
            []),
          teacher,
        ]);
      if (teacher.num_empleado) {
        const employee = normalizeEmployeeNumber(teacher.num_empleado);
        teacherByEmployee.set(employee, [
          ...(teacherByEmployee.get(employee) || []),
          teacher,
        ]);
      }
    }

    const { data: subjects, error: subjectsError } = await client
      .from("asignaturas")
      .select("id,clave,nombre");
    if (subjectsError)
      throw new Error(`No se pudo leer asignaturas: ${subjectsError.message}`);
    const subjectByKey = new Map<string, any[]>();
    for (const subject of subjects || [])
      subjectByKey.set(normalizeText(subject.clave), [
        ...(subjectByKey.get(normalizeText(subject.clave)) || []),
        subject,
      ]);

    const { data: groups, error: groupsError } = await client
      .from("grupos")
      .select(
        "id,clave,cuatrimestre_id,asignatura_id,docente_id,num_alumnos,plan_normalizado,grado,grupo_normalizado,importacion_key",
      )
      .eq("cuatrimestre_id", cycleId)
      .eq("activo", true);
    if (groupsError)
      throw new Error(
        `No se pudo leer grupos del ciclo: ${groupsError.message}`,
      );
    const groupList = groups || [];
    const assignments = new Map<
      string,
      {
        row: ClassRow;
        teacherId: number | null;
        subjectId: number | null;
        teacher: string;
      }
    >();
    let teacherResolved = 0;
    let subjectResolved = 0;
    let groupResolved = 0;
    let assignmentCreated = 0;
    let assignmentUpdated = 0;

    for (const row of validRows) {
      const teacherValues = row.teacher
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);
      let teacherCandidates: any[] = [];
      if (row.teacherEmail) {
        teacherCandidates = teacherByEmail.get(row.teacherEmail) || [];
      } else if (row.teacherEmployee) {
        teacherCandidates = teacherByEmployee.get(row.teacherEmployee) || [];
      } else if (!row.teacher) {
        issues.push(issue(row, "docente_faltante", "", { sourceRow: row.row }));
      } else if (teacherValues.some((value) => value.includes("@"))) {
        teacherCandidates = [
          ...new Map(
            teacherValues
              .flatMap((value) => teacherByEmail.get(value.toLowerCase()) || [])
              .map((item) => [item.id, item]),
          ).values(),
        ];
      } else {
        teacherCandidates = teacherByName.get(row.teacher) || [];
      }
      const teacherId =
        teacherCandidates.length === 1 ? teacherCandidates[0].id : null;
      if (teacherId) teacherResolved += 1;
      else if (row.teacher)
        issues.push(
          issue(
            row,
            teacherCandidates.length > 1
              ? "docente_ambiguo"
              : "docente_no_encontrado",
            row.teacher,
            { matches: teacherCandidates.length },
          ),
        );

      const subjectCandidates = subjectByKey.get(row.subjectKey) || [];
      let subjectId =
        subjectCandidates.length === 1 ? subjectCandidates[0].id : null;
      if (subjectCandidates.length === 0) {
        const { data: createdSubject, error } = await client
          .from("asignaturas")
          .insert({
            clave: row.subjectKey,
            nombre: row.subjectName,
            activa: true,
          })
          .select("id,clave,nombre")
          .maybeSingle();
        if (!error && createdSubject) {
          subjectId = createdSubject.id;
          subjects?.push(createdSubject);
          subjectByKey.set(row.subjectKey, [createdSubject]);
        } else {
          const retry =
            subjects?.filter(
              (subject) => normalizeText(subject.clave) === row.subjectKey,
            ) || [];
          subjectId = retry.length === 1 ? retry[0].id : null;
          if (!subjectId)
            issues.push(
              issue(row, "asignatura_no_guardada", row.subjectKey, {
                error: error?.message,
              }),
            );
        }
      } else if (subjectCandidates.length > 1) {
        issues.push(
          issue(row, "asignatura_ambigua", row.subjectKey, {
            matches: subjectCandidates.length,
          }),
        );
      } else if (
        subjectId &&
        normalizeText(subjectCandidates[0].nombre) !== row.subjectName
      ) {
        const { error } = await client
          .from("asignaturas")
          .update({ nombre: row.subjectName })
          .eq("id", subjectId);
        if (error)
          issues.push(
            issue(row, "asignatura_no_guardada", row.subjectKey, {
              error: error.message,
            }),
          );
      }
      if (subjectId) subjectResolved += 1;

      const plan = normalizeImportedPlan(row.plan);
      const group = normalizeImportedGroup(row.group);
      let groupCandidates = groupList.filter(
        (candidate) =>
          normalizeImportedPlan(candidate.plan_normalizado) === plan &&
          normalizeImportedGroup(
            candidate.grupo_normalizado || candidate.clave,
          ) === group,
      );
      let fallbackUsed = false;
      if (groupCandidates.length === 0) {
        fallbackUsed = true;
        groupCandidates = groupList.filter(
          (candidate) =>
            normalizeImportedGroup(
              candidate.grupo_normalizado || candidate.clave,
            ) === group,
        );
        const plans = [
          ...new Set(
            groupCandidates
              .map((candidate) =>
                normalizeImportedPlan(candidate.plan_normalizado),
              )
              .filter(Boolean),
          ),
        ];
        if (
          groupCandidates.length > 0 &&
          (plans.length !== 1 ||
            groupCandidates.some(
              (candidate) => !normalizeImportedPlan(candidate.plan_normalizado),
            ))
        ) {
          const baseCandidates = groupCandidates.filter(
            (candidate) => !candidate.asignatura_id,
          );
          issues.push(
            issue(
              row,
              "grupo_ambiguo",
              group,
              groupDiagnosticDetails(
                cycleId,
                plan,
                group,
                groupList,
                groupCandidates,
                baseCandidates,
                fallbackUsed,
                { reason: "multiple_plans", plans },
              ),
            ),
          );
          continue;
        }
      }
      const grades = [
        ...new Set(
          groupCandidates
            .map((candidate) => normalizeText(candidate.grado))
            .filter(Boolean),
        ),
      ];
      const baseCandidates = groupCandidates.filter(
        (candidate) => !candidate.asignatura_id,
      );
      if (grades.length > 1) {
        issues.push(
          issue(
            row,
            "grupo_ambiguo",
            group,
            groupDiagnosticDetails(
              cycleId,
              plan,
              group,
              groupList,
              groupCandidates,
              baseCandidates,
              fallbackUsed,
              { reason: "multiple_grades", grades },
            ),
          ),
        );
        continue;
      }
      const base = selectCanonicalEquivalentBaseCandidate(baseCandidates);
      if (!base && baseCandidates.length > 0) {
        issues.push(
          issue(
            row,
            "grupo_ambiguo",
            group,
            groupDiagnosticDetails(
              cycleId,
              plan,
              group,
              groupList,
              groupCandidates,
              baseCandidates,
              fallbackUsed,
              {
                reason: "multiple_base_groups",
                matches: baseCandidates.length,
              },
            ),
          ),
        );
        continue;
      }
      if (!base) {
        issues.push(
          issue(
            row,
            "grupo_base_no_encontrado",
            group,
            groupDiagnosticDetails(
              cycleId,
              plan,
              group,
              groupList,
              groupCandidates,
              baseCandidates,
              fallbackUsed,
            ),
          ),
        );
        continue;
      }
      groupResolved += 1;
      const assignmentKey = assignmentImportKey(
        cycleId,
        plan,
        base.grado,
        group,
        row.subjectKey,
      );
      if (!assignments.has(assignmentKey))
        assignments.set(assignmentKey, {
          row,
          teacherId,
          subjectId,
          teacher: row.teacher,
        });
    }

    for (const batch of chunks([...assignments.entries()])) {
      for (const [assignmentKey, resolved] of batch) {
        const { row, teacherId, subjectId } = resolved;
        const plan = normalizeImportedPlan(row.plan);
        const group = normalizeImportedGroup(row.group);
        const candidates = groupList.filter(
          (candidate) =>
            normalizeImportedPlan(candidate.plan_normalizado) === plan &&
            normalizeImportedGroup(
              candidate.grupo_normalizado || candidate.clave,
            ) === group,
        );
        const baseCandidates = candidates.filter(
          (candidate) => !candidate.asignatura_id,
        );
        const base = selectCanonicalEquivalentBaseCandidate(baseCandidates);
        if (!base || !subjectId) continue;
        const existingCandidates = groupList.filter(
          (candidate) =>
            candidate.importacion_key === assignmentKey ||
            (candidate.asignatura_id === subjectId &&
              normalizeImportedPlan(candidate.plan_normalizado) === plan &&
              normalizeImportedGroup(
                candidate.grupo_normalizado || candidate.clave,
              ) === group),
        );
        if (existingCandidates.length > 1) {
          issues.push(
            issue(
              row,
              "grupo_ambiguo",
              group,
              groupDiagnosticDetails(
                cycleId,
                plan,
                group,
                groupList,
                candidates,
                baseCandidates,
                false,
                {
                  reason: "multiple_subject_assignments",
                  subject: row.subjectKey,
                  matches: existingCandidates.length,
                  existingCandidateIds: existingCandidates.map(
                    (candidate) => candidate.id,
                  ),
                },
              ),
            ),
          );
          continue;
        }
        const existing = existingCandidates[0];
        const payload = {
          clave: base.clave || group.slice(0, 20),
          cuatrimestre_id: cycleId,
          asignatura_id: subjectId,
          docente_id: teacherId ?? existing?.docente_id ?? null,
          plan_normalizado: plan,
          grado: base.grado || null,
          grupo_normalizado: group,
          num_alumnos: base.num_alumnos || 0,
          activo: true,
          importacion_key: assignmentKey,
        };
        if (existing) {
          const { error } = await client
            .from("grupos")
            .update(payload)
            .eq("id", existing.id);
          if (error)
            issues.push(
              issue(row, "grupo_no_guardado", group, { error: error.message }),
            );
          else assignmentUpdated += 1;
        } else {
          const { data: created, error } = await client
            .from("grupos")
            .insert(payload)
            .select("id")
            .maybeSingle();
          if (error || !created) {
            issues.push(
              issue(row, "grupo_no_guardado", group, { error: error?.message }),
            );
            continue;
          }
          assignmentCreated += 1;
          const { data: enrollments } = await client
            .from("inscripciones")
            .select("estudiante_id,cuatrimestre_id")
            .eq("grupo_id", base.id)
            .eq("cuatrimestre_id", cycleId);
          if (enrollments?.length) {
            const { error: enrollmentError } = await client
              .from("inscripciones")
              .upsert(
                enrollments.map((enrollment) => ({
                  estudiante_id: enrollment.estudiante_id,
                  grupo_id: created.id,
                  cuatrimestre_id: enrollment.cuatrimestre_id,
                })),
                { onConflict: "estudiante_id,grupo_id,cuatrimestre_id" },
              );
            if (enrollmentError)
              issues.push(
                issue(row, "fila_inscripciones_no_guardadas", group, {
                  error: enrollmentError.message,
                  baseGroupId: base.id,
                }),
              );
          }
        }
      }
    }

    if (issues.length)
      await saveImportIssues(
        client,
        run.id,
        issues.map((item) => ({
          ...item,
          cuatrimestre_id: cycleId,
          ciclo: cycle.clave,
        })),
      );
    let issuesResolvedByRevalidation = 0;
    let revalidationWarning: string | undefined;
    try {
      issuesResolvedByRevalidation = await revalidateOpenAssignmentIssues(
        client,
        cycleId,
      );
    } catch (error) {
      revalidationWarning =
        "No se pudieron reconciliar las incidencias abiertas; la importación se finalizó sin resolver incidencias automáticamente.";
      console.error("[Importar asignaciones] revalidation failed", {
        runId: run.id,
        cycleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const summary = {
      rowsRead: records.length - 1,
      teacherResolved,
      subjectResolved,
      groupResolved,
      assignmentCreated,
      assignmentUpdated,
      issues: issues.length,
      issuesResolvedByRevalidation,
      ...(revalidationWarning ? { revalidationWarning } : {}),
    };
    await finishImportRun(client, run.id, summary);

    let recalculo: { recalculados: number; errores: number } | undefined;
    try {
      recalculo = await recalcularCalificacionesCuatrimestre(client, cycleId, {
        refrescarAgregados: true,
        soloDocentesConInstrumentos: false,
      });
      console.log(
        `[Importar asignaciones] Recálculo completado para ciclo ${cycleId}:`,
        recalculo,
      );
    } catch (error) {
      console.error(
        `[Importar asignaciones] Error durante recálculo de calificaciones:`,
        error,
      );
      recalculo = { recalculados: 0, errores: 1 };
    }

    await audit.complete({ ...summary, import_run_id: run.id, recalculo });

    return json({
      success: true,
      runId: run.id,
      cycle: { id: cycle.id, clave: cycle.clave },
      ...summary,
      recalculo,
      traceability: {
        changeSetId: audit.changeSetId,
        restorePointId: audit.restorePointId,
      },
      reportUrl: `/api/admin/import-report?run_id=${run.id}`,
    });
  } catch (error) {
    console.error("[Importar asignaciones]", error);
    if (audit) {
      try {
        await audit.fail("error_interno_importacion");
      } catch (auditError) {
        console.error(
          "[Importar asignaciones] no se pudo cerrar la trazabilidad",
          auditError,
        );
      }
    }
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
