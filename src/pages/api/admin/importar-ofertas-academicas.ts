import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import { authorizeSuperadmin, json } from "../../../lib/adminImport";
import {
  startImportAudit,
  type ImportAudit,
} from "../../../lib/auditChangeSet";
import {
  parseAcademicOfferCsv,
  planAcademicOfferImport,
  type AcademicOfferImportAction,
} from "../../../lib/academicOfferImport";
import { obtenerClienteAdmin } from "../../../lib/supabaseClient";
import { ImportFormSchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

const ACADEMIC_OFFER_IMPORT_VERSION =
  "offer-subject-reconciliation-v2-group-modalities";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function previewSignature(
  cycleId: number,
  fileHash: string,
  actions: AcademicOfferImportAction[],
) {
  return digest(
    JSON.stringify({
      cycleId,
      fileHash,
      actions: actions.map((action) => ({
        actionKey: action.actionKey,
        offerId: action.offerId,
        subjectId: action.subjectId,
        expectedSubjectOfferId: action.expectedSubjectOfferId,
        groupMatches: action.groupMatches,
      })),
    }),
  );
}

async function reconcile(
  request: Request,
  cookies: Parameters<APIRoute>[0]["cookies"],
  mode: "preview" | "apply",
) {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
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

  let snapshotClient: ReturnType<typeof obtenerClienteAdmin>;
  try {
    snapshotClient = obtenerClienteAdmin();
  } catch (error) {
    return json(
      {
        error: `No se pudo preparar la conciliación: ${error instanceof Error ? error.message : String(error)}`,
      },
      503,
    );
  }
  const [cycleResult, offersResult, subjectsResult, groupsResult] =
    await Promise.all([
      snapshotClient
        .from("cuatrimestres")
        .select("id,clave,nombre")
        .eq("id", cycleId)
        .maybeSingle(),
      snapshotClient.from("ofertas_academicas").select("id,nombre"),
      snapshotClient.from("asignaturas").select("id,oferta_academica_id"),
      snapshotClient
        .from("grupos")
        .select(
          "id,cuatrimestre_id,asignatura_id,plan_normalizado,grupo_normalizado,clave,grado",
        )
        .eq("cuatrimestre_id", cycleId)
        .eq("activo", true)
        .not("asignatura_id", "is", null),
    ]);
  if (
    cycleResult.error ||
    offersResult.error ||
    subjectsResult.error ||
    groupsResult.error
  ) {
    return json(
      {
        error: `No se pudo preparar la conciliación: ${cycleResult.error?.message || offersResult.error?.message || subjectsResult.error?.message || groupsResult.error?.message}`,
      },
      503,
    );
  }
  if (!cycleResult.data)
    return json({ error: "El ciclo seleccionado no existe" }, 400);

  const parsedCsv = parseAcademicOfferCsv(text);
  const proposal = planAcademicOfferImport({
    cycleId,
    rows: parsedCsv.rows,
    initialBlockers: parsedCsv.blockers,
    offers: offersResult.data || [],
    subjects: subjectsResult.data || [],
    groups: groupsResult.data || [],
  });
  const signature = previewSignature(cycleId, fileHash, proposal.actions);
  if (mode === "preview") {
    return json({
      success: true,
      mode,
      importVersion: ACADEMIC_OFFER_IMPORT_VERSION,
      cycle: cycleResult.data,
      fileHash,
      previewSignature: signature,
      rowsRead: proposal.rowsRead,
      summary: proposal.summary,
      blockers: proposal.blockers,
      warnings: proposal.warnings,
      actions: proposal.actions,
    });
  }

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
  if (!proposal.actions.length) {
    return json(
      {
        error: "No hay filas seguras para aplicar.",
        blockers: proposal.blockers,
        warnings: proposal.warnings,
      },
      409,
    );
  }

  let audit: ImportAudit | null = null;
  try {
    audit = await startImportAudit({
      client: auth.client,
      source: "admin.import.ofertas_academicas",
      cycleId,
      file,
    });
    const { data, error } = await auth.client.rpc(
      "apply_academic_offer_import",
      {
        p_cuatrimestre_id: cycleId,
        p_actions: proposal.actions.map((action) => ({
          offer_name: action.offerName,
          offer_normalized: action.offerNormalized,
          offer_id: action.offerId,
          subject_id: action.subjectId,
          expected_subject_offer_id: action.expectedSubjectOfferId,
          group_matches: action.groupMatches.map((match) => ({
            group_id: match.groupId,
            plan: match.plan,
            group: match.group,
            grade: match.grade,
          })),
        })),
      },
    );
    if (error) throw new Error(error.message);
    await audit.complete({
      ...proposal.summary,
      rowsRead: proposal.rowsRead,
      unsafeRows: proposal.blockers.length,
      warnings: proposal.warnings.length,
      result: data || {},
    });
    return json({
      success: true,
      mode,
      importVersion: ACADEMIC_OFFER_IMPORT_VERSION,
      cycle: cycleResult.data,
      rowsRead: proposal.rowsRead,
      summary: proposal.summary,
      blockers: proposal.blockers,
      warnings: proposal.warnings,
      result: data || {},
      traceability: {
        changeSetId: audit.changeSetId,
        restorePointId: audit.restorePointId,
      },
    });
  } catch (error) {
    if (audit) {
      try {
        await audit.fail("error_aplicando_ofertas_academicas", {
          rowsRead: proposal.rowsRead,
          safeActions: proposal.actions.length,
        });
      } catch (auditError) {
        console.error(
          "[Importar ofertas académicas] no se pudo cerrar la trazabilidad",
          auditError,
        );
      }
    }
    return json(
      {
        error: `No se pudo aplicar la conciliación: ${error instanceof Error ? error.message : String(error)}`,
      },
      503,
    );
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let mode: string | null = null;
  try {
    mode = new URL(request.url).searchParams.get("mode");
  } catch {
    return json({ error: "URL de solicitud inválida" }, 400);
  }
  if (mode !== "preview" && mode !== "apply")
    return json({ error: "Modo de importación inválido" }, 400);
  return reconcile(request, cookies, mode);
};
