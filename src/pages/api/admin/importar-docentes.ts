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
  normalizeEmail,
  normalizeEmployeeNumber,
  normalizeKey,
  normalizeText,
  parseCsv,
} from "../../../lib/importCsv";
import {
  startImportAudit,
  type ImportAudit,
} from "../../../lib/auditChangeSet";

type Issue = Record<string, unknown>;

function splitTeacherName(fullName: string, surnameFirst = false) {
  const parts = normalizeText(fullName).split(" ").filter(Boolean);
  if (parts.length < 2) return { nombre: parts[0] || "", apellidos: "" };
  return surnameFirst
    ? {
        nombre: parts.slice(2).join(" ") || parts[0],
        apellidos: parts.slice(0, 2).join(" "),
      }
    : {
        nombre: parts.slice(0, -2).join(" ") || parts[0],
        apellidos: parts.slice(-2).join(" "),
      };
}

function issue(
  row: number,
  reason: string,
  original: string,
  normalized: string,
  details: Record<string, unknown> = {},
): Issue {
  return {
    categoria: "docente",
    razon: reason,
    fila: row,
    valor_original: original || null,
    valor_normalizado: normalized || null,
    detalles: details,
  };
}

export const GET: APIRoute = async ({ cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const content = [
    "NOMBRE COMPLETO,CORREO,NUM EMPLEADO",
    "APELLIDO PATERNO APELLIDO MATERNO NOMBRE,tup-d0000@ejemplo.edu.mx,0000",
  ].join("\r\n");
  return new Response(`\uFEFF${content}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla_docentes.csv"',
    },
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
  const client = auth.client;
  let audit: ImportAudit | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return json({ error: "Archivo CSV requerido" }, 400);
    if (file.size > 25 * 1024 * 1024)
      return json({ error: "El archivo no debe superar 25 MB" }, 400);
    audit = await startImportAudit({
      client,
      source: "admin.import.docentes",
      file,
    });

    const { data: run, error: runError } = await client
      .from("import_runs")
      .insert({
        tipo: "docentes",
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
    const issues: Issue[] = [];
    if (records.length < 2) {
      await saveImportIssues(client, run.id, [
        issue(1, "archivo_vacio", file.name, ""),
      ]);
      await finishImportRun(
        client,
        run.id,
        { rowsRead: 0, issues: 1 },
        "completed",
      );
      await audit.fail("archivo_vacio", { rowsRead: 0, issues: 1 });
      return json(
        { error: "CSV vacío o sin filas de datos", runId: run.id },
        400,
      );
    }

    const headers = records[0];
    const columns = {
      fullName: findColumn(
        headers,
        "NOMBRE COMPLETO",
        "DOCENTE",
        "NOMBRE COMPLETO DOCENTE",
      ),
      nombre: findColumn(headers, "NOMBRE"),
      apellidoPaterno: findColumn(
        headers,
        "APELLIDO PATERNO",
        "PRIMER APELLIDO",
      ),
      apellidoMaterno: findColumn(
        headers,
        "APELLIDO MATERNO",
        "SEGUNDO APELLIDO",
      ),
      email: findColumn(
        headers,
        "CORREO",
        "EMAIL",
        "CORREO INSTITUCIONAL",
        "CORREO ELECTRÓNICO",
      ),
      employee: findColumn(
        headers,
        "NUM EMPLEADO",
        "NÚMERO DE EMPLEADO",
        "NUMERO DE EMPLEADO",
        "EMPLEADO",
        "CLAVE EMPLEADO",
      ),
    };
    if (columns.email < 0 && columns.employee < 0) {
      const contractIssue = issue(
        1,
        "contrato_sin_identidad_estable",
        headers.join(", "),
        "",
        { required: "CORREO o NUM EMPLEADO" },
      );
      await saveImportIssues(client, run.id, [contractIssue]);
      await finishImportRun(
        client,
        run.id,
        { rowsRead: records.length - 1, issues: 1, contractError: true },
        "completed",
      );
      await audit.fail("contrato_invalido", {
        rowsRead: records.length - 1,
        issues: 1,
      });
      return json(
        {
          error:
            "Contrato inválido: el CSV debe incluir CORREO/EMAIL o NUM EMPLEADO. No se crearon docentes.",
          runId: run.id,
          issues: 1,
        },
        400,
      );
    }
    if (
      columns.fullName < 0 &&
      (columns.nombre < 0 ||
        columns.apellidoPaterno < 0 ||
        columns.apellidoMaterno < 0)
    ) {
      const contractIssue = issue(
        1,
        "contrato_sin_nombre",
        headers.join(", "),
        "",
        { required: "NOMBRE COMPLETO o NOMBRE + apellidos" },
      );
      await saveImportIssues(client, run.id, [contractIssue]);
      await finishImportRun(
        client,
        run.id,
        { rowsRead: records.length - 1, issues: 1, contractError: true },
        "completed",
      );
      await audit.fail("contrato_invalido", {
        rowsRead: records.length - 1,
        issues: 1,
      });
      return json(
        {
          error:
            "Contrato inválido: falta NOMBRE COMPLETO o NOMBRE + apellidos. No se crearon docentes.",
          runId: run.id,
          issues: 1,
        },
        400,
      );
    }

    const value = (values: string[], column: number) =>
      column >= 0 ? (values[column] || "").trim() : "";
    const { data: existing, error: existingError } = await client
      .from("docentes")
      .select("id,nombre,apellidos,email,num_empleado,activo");
    if (existingError)
      throw new Error(`No se pudo leer docentes: ${existingError.message}`);
    const byEmail = new Map<string, any[]>();
    const byEmployee = new Map<string, any[]>();
    for (const teacher of existing || []) {
      const email = normalizeEmail(teacher.email);
      const employee = normalizeEmployeeNumber(teacher.num_empleado);
      if (email) byEmail.set(email, [...(byEmail.get(email) || []), teacher]);
      if (employee)
        byEmployee.set(employee, [
          ...(byEmployee.get(employee) || []),
          teacher,
        ]);
    }

    let matched = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Map<string, number>();
    const updates: any[] = [];
    const inserts: any[] = [];

    for (let index = 1; index < records.length; index += 1) {
      const values = records[index];
      const rowNumber = index + 1;
      const fullName = value(values, columns.fullName);
      const name =
        columns.fullName >= 0
          ? splitTeacherName(
              fullName,
              normalizeKey(headers[columns.fullName]) === "DOCENTE",
            )
          : {
              nombre: value(values, columns.nombre),
              apellidos:
                `${value(values, columns.apellidoPaterno)} ${value(values, columns.apellidoMaterno)}`.trim(),
            };
      const email = normalizeEmail(value(values, columns.email));
      const employee = normalizeEmployeeNumber(value(values, columns.employee));
      const identityKey = email
        ? `email:${email}`
        : employee
          ? `employee:${employee}`
          : "";
      if (!identityKey) {
        skipped += 1;
        issues.push(
          issue(
            rowNumber,
            "identidad_estable_faltante",
            fullName,
            normalizeText(fullName),
          ),
        );
        continue;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped += 1;
        issues.push(
          issue(rowNumber, "correo_invalido", email, email, { employee }),
        );
        continue;
      }
      if (seen.has(identityKey)) {
        skipped += 1;
        issues.push(
          issue(
            rowNumber,
            "identidad_duplicada_en_archivo",
            fullName,
            identityKey,
            { primeraFila: seen.get(identityKey) },
          ),
        );
        continue;
      }
      seen.set(identityKey, rowNumber);
      if (!name.nombre || !name.apellidos) {
        skipped += 1;
        issues.push(
          issue(
            rowNumber,
            "identidad_incompleta",
            fullName,
            normalizeText(fullName),
            { email, employee },
          ),
        );
        continue;
      }

      const emailMatches = email ? byEmail.get(email) || [] : [];
      const employeeMatches = employee ? byEmployee.get(employee) || [] : [];
      const candidates = [
        ...new Map(
          [...emailMatches, ...employeeMatches].map((item) => [item.id, item]),
        ).values(),
      ];
      if (
        emailMatches.length > 1 ||
        employeeMatches.length > 1 ||
        (emailMatches.length &&
          employeeMatches.length &&
          emailMatches[0].id !== employeeMatches[0].id)
      ) {
        skipped += 1;
        issues.push(
          issue(rowNumber, "identidad_ambigua", fullName, identityKey, {
            email,
            employee,
          }),
        );
        continue;
      }

      if (candidates.length === 1) {
        matched += 1;
        const current = candidates[0];
        const payload = {
          nombre: name.nombre,
          apellidos: name.apellidos,
          email: email || current.email || null,
          num_empleado: employee || current.num_empleado || null,
          nombre_normalizado: normalizeText(`${name.nombre} ${name.apellidos}`),
          activo: true,
        };
        if (
          current.email !== payload.email ||
          current.num_empleado !== payload.num_empleado ||
          current.nombre !== payload.nombre ||
          current.apellidos !== payload.apellidos ||
          !current.activo
        )
          updates.push({ id: current.id, ...payload });
      } else {
        inserts.push({
          nombre: name.nombre,
          apellidos: name.apellidos,
          email: email || null,
          num_empleado: employee || null,
          nombre_normalizado: normalizeText(`${name.nombre} ${name.apellidos}`),
          activo: true,
        });
      }
    }

    for (const batch of chunks(updates)) {
      for (const item of batch) {
        const { error } = await client
          .from("docentes")
          .update(item)
          .eq("id", item.id);
        if (error)
          issues.push(
            issue(
              0,
              "docente_no_guardado",
              item.nombre,
              item.nombre_normalizado,
              { error: error.message },
            ),
          );
        else updated += 1;
      }
    }
    for (const batch of chunks(inserts)) {
      const { data, error } = await client
        .from("docentes")
        .insert(batch)
        .select("id");
      if (error || !data) {
        for (const item of batch)
          issues.push(
            issue(
              0,
              "docente_no_guardado",
              `${item.nombre} ${item.apellidos}`,
              item.nombre_normalizado,
              { error: error?.message },
            ),
          );
      } else created += data.length;
    }

    if (issues.length) await saveImportIssues(client, run.id, issues);
    const summary = {
      rowsRead: records.length - 1,
      matched,
      created,
      updated,
      skipped,
      issues: issues.length,
    };
    await client
      .from("import_runs")
      .update({ filas_leidas: records.length - 1 })
      .eq("id", run.id);
    // No se recalculan calificaciones aquí: esta importación no vincula
    // docentes a grupos/instrumentos de un cuatrimestre específico.
    // Cuando un docente importado reciba asignaciones, el endpoint
    // importar-asignaciones recalculará su calificación en batch.
    await finishImportRun(client, run.id, summary);
    await audit.complete({ ...summary, import_run_id: run.id });
    return json({
      success: true,
      runId: run.id,
      ...summary,
      traceability: {
        changeSetId: audit.changeSetId,
        restorePointId: audit.restorePointId,
      },
      reportUrl: `/api/admin/import-report?run_id=${run.id}`,
    });
  } catch (error) {
    console.error("[Importar docentes]", error);
    if (audit) {
      try {
        await audit.fail("error_interno_importacion");
      } catch (auditError) {
        console.error(
          "[Importar docentes] no se pudo cerrar la trazabilidad",
          auditError,
        );
      }
    }
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno al importar docentes",
      },
      500,
    );
  }
};
