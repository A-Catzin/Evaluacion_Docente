import { createHash } from "node:crypto";

type Client = any;
type SnapshotKind = "docentes" | "alumnos" | "asignaciones";

type ImportAuditOptions = {
  client: Client;
  source: `admin.import.${SnapshotKind}`;
  cycleId?: number | null;
  file: File;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function snapshotTable(
  client: Client,
  table: string,
  columns: string,
  cycleId?: number | null,
) {
  let query = client.from(table).select(columns, { count: "exact" }).order("id").range(0, 999);
  if (cycleId && ["grupos", "inscripciones", "calificaciones_finales"].includes(table)) query = query.eq("cuatrimestre_id", cycleId);
  const { data, count, error } = await query;
  if (error) throw new Error(`No se pudo capturar el manifiesto de ${table}: ${error.message}`);
  const captured = data || [];
  return {
    table,
    total_rows: count ?? captured.length,
    captured_rows: captured.length,
    bounded: (count ?? captured.length) <= 1000,
    safe_content_hash: sha256(JSON.stringify(captured)),
  };
}

async function createManifest(client: Client, source: string, cycleId?: number | null) {
  const tables = source === "admin.import.docentes"
    ? [["docentes", "id,activo"]]
    : source === "admin.import.alumnos"
      ? [["estudiantes", "id,activo"], ["grupos", "id,cuatrimestre_id,asignatura_id,docente_id,num_alumnos,activo"], ["inscripciones", "id,grupo_id,cuatrimestre_id"]]
      : [["asignaturas", "id,clave,activa"], ["grupos", "id,cuatrimestre_id,asignatura_id,docente_id,num_alumnos,activo"], ["inscripciones", "id,grupo_id,cuatrimestre_id"], ["calificaciones_finales", "id,docente_id,cuatrimestre_id,calificacion_final,categoria_final,num_instrumentos_completados"]];
  const manifests = await Promise.all(tables.map(([table, columns]) => snapshotTable(client, table, columns, cycleId)));
  return {
    version: "phase-1-manifest-v1",
    capture_kind: "bounded_sanitized_manifest",
    source,
    cuatrimestre_id: cycleId ?? null,
    tables: manifests,
    restore_execution_available: false,
  };
}

export type ImportAudit = {
  changeSetId: string;
  restorePointId: string;
  complete: (summary: Record<string, unknown>) => Promise<void>;
  fail: (reason: string, summary?: Record<string, unknown>) => Promise<void>;
};

export async function startImportAudit(options: ImportAuditOptions): Promise<ImportAudit> {
  const fileHash = sha256(Buffer.from(await options.file.arrayBuffer()));
  const inputMetadata = {
    file_name: options.file.name.slice(0, 200),
    file_type: options.file.type.slice(0, 120) || null,
    file_size_bytes: options.file.size,
    file_sha256: fileHash,
  };
  const scope = {
    kind: options.source,
    cuatrimestre_id: options.cycleId ?? null,
  };
  const { data: changeSetId, error: changeSetError } = await options.client.rpc("audit_create_change_set", {
    p_source: options.source,
    p_operation: "csv_import",
    p_cuatrimestre_id: options.cycleId ?? null,
    p_scope: scope,
    p_input_metadata: inputMetadata,
  });
  if (changeSetError || !changeSetId) throw new Error(`No se pudo iniciar la trazabilidad: ${changeSetError?.message || "sin identificador"}`);

  let restorePointId: string;
  try {
    const manifest = await createManifest(options.client, options.source, options.cycleId);
    const { data, error: restoreError } = await options.client.rpc("audit_create_restore_point", {
      p_change_set_id: changeSetId,
      p_manifest: manifest,
    });
    if (restoreError || !data) throw new Error(restoreError?.message || "sin identificador");
    restorePointId = data;
  } catch (error) {
    await options.client.rpc("audit_finish_change_set", {
      p_change_set_id: changeSetId,
      p_status: "failed",
      p_summary: { stage: "restore_point" },
      p_error_safe: "restore_point_capture_failed",
    });
    throw new Error(`No se pudo crear el punto de restauración: ${error instanceof Error ? error.message : "sin identificador"}`);
  }

  let closed = false;
  async function finish(status: "completed" | "failed", summary: Record<string, unknown>, reason?: string) {
    if (closed) return;
    const { error } = await options.client.rpc("audit_finish_change_set", {
      p_change_set_id: changeSetId,
      p_status: status,
      p_summary: summary,
      p_error_safe: reason || null,
    });
    if (error) throw new Error(`No se pudo cerrar la trazabilidad: ${error.message}`);
    closed = true;
  }

  return {
    changeSetId,
    restorePointId,
    complete: (summary) => finish("completed", summary),
    fail: (reason, summary = {}) => finish("failed", summary, reason.slice(0, 500)),
  };
}
