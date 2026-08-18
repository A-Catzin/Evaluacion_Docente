import type { APIRoute } from "astro";
import {
  authorizeSuperadmin,
  finishImportRun,
  json,
  saveImportIssues,
} from "../../../lib/adminImport";
import {
  chunks,
  findColumn,
  normalizeEmployeeNumber,
  normalizeText,
  parseCsv,
} from "../../../lib/importCsv";
import { ImportFormSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

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

function baseGroup(value: string): string {
  return normalizeText(value).split(" - ")[0].trim();
}

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

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const client = auth.client;

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
    if (runError || !run)
      return json(
        {
          error: `No se pudo iniciar la importación: ${runError?.message || "sin identificador"}`,
        },
        500,
      );

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
      group: baseGroup(value(values, columns.group)),
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
      .eq("cuatrimestre_id", cycleId);
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

      const plan = normalizeText(row.plan);
      const group = normalizeText(row.group);
      let groupCandidates = groupList.filter(
        (candidate) =>
          normalizeText(candidate.plan_normalizado) === plan &&
          normalizeText(candidate.grupo_normalizado || candidate.clave) ===
            group,
      );
      const grades = [
        ...new Set(
          groupCandidates
            .map((candidate) => normalizeText(candidate.grado))
            .filter(Boolean),
        ),
      ];
      if (grades.length > 1) {
        issues.push(
          issue(row, "grupo_ambiguo", group, {
            reason: "multiple_grades",
            grades,
          }),
        );
        continue;
      }
      if (groupCandidates.length === 0) {
        groupCandidates = groupList.filter(
          (candidate) =>
            normalizeText(candidate.grupo_normalizado || candidate.clave) ===
            group,
        );
        const plans = [
          ...new Set(
            groupCandidates
              .map((candidate) => normalizeText(candidate.plan_normalizado))
              .filter(Boolean),
          ),
        ];
        if (plans.length > 1) {
          issues.push(
            issue(row, "grupo_ambiguo", group, {
              reason: "multiple_plans",
              plans,
            }),
          );
          continue;
        }
      }
      const baseCandidates = groupCandidates.filter(
        (candidate) => !candidate.asignatura_id,
      );
      if (baseCandidates.length > 1) {
        issues.push(
          issue(row, "grupo_ambiguo", group, {
            reason: "multiple_base_groups",
            matches: baseCandidates.length,
          }),
        );
        continue;
      }
      const base = baseCandidates[0];
      if (!base) {
        issues.push(issue(row, "grupo_base_no_encontrado", group, { plan }));
        continue;
      }
      groupResolved += 1;
      const assignmentKey = `${cycleId}|${plan}|${normalizeText(base.grado)}|${group}|${row.subjectKey}`;
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
        const plan = normalizeText(row.plan);
        const group = normalizeText(row.group);
        const candidates = groupList.filter(
          (candidate) =>
            normalizeText(candidate.plan_normalizado) === plan &&
            normalizeText(candidate.grupo_normalizado || candidate.clave) ===
              group,
        );
        const baseCandidates = candidates.filter(
          (candidate) => !candidate.asignatura_id,
        );
        const base = baseCandidates.length === 1 ? baseCandidates[0] : null;
        if (!base || !subjectId) continue;
        const existingCandidates = groupList.filter(
          (candidate) =>
            candidate.importacion_key === assignmentKey ||
            (candidate.asignatura_id === subjectId &&
              normalizeText(candidate.plan_normalizado) === plan &&
              normalizeText(candidate.grupo_normalizado || candidate.clave) ===
                group),
        );
        if (existingCandidates.length > 1) {
          issues.push(
            issue(row, "grupo_ambiguo", group, {
              reason: "multiple_subject_assignments",
              subject: row.subjectKey,
              matches: existingCandidates.length,
            }),
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
    const summary = {
      rowsRead: records.length - 1,
      teacherResolved,
      subjectResolved,
      groupResolved,
      assignmentCreated,
      assignmentUpdated,
      issues: issues.length,
    };
    await client
      .from("import_runs")
      .update({ filas_leidas: records.length - 1 })
      .eq("id", run.id);
    // TODO(Paso 2 mejora futura): después de importar asignaciones se podría
    // recalcular en batch las calificaciones finales de los docentes afectados
    // usando recalcularCalificacionDocente() desde src/services/calificaciones.
    await finishImportRun(client, run.id, summary);
    return json({
      success: true,
      runId: run.id,
      cycle: { id: cycle.id, clave: cycle.clave },
      ...summary,
      reportUrl: `/api/admin/import-report?run_id=${run.id}`,
    });
  } catch (error) {
    console.error("[Importar asignaciones]", error);
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
