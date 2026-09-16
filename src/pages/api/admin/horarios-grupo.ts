import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import { authorizeSuperadmin, json } from "../../../lib/adminImport";
import {
  parseHorariosGrupoCsv,
  planHorariosGrupoImport,
  validateHorarioGrupoInput,
  type HorarioGrupoImportAction,
} from "../../../lib/importHorariosGrupo";
import { obtenerClienteAdmin } from "../../../lib/supabaseClient";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signature(
  cycleId: number,
  fileHash: string,
  actions: HorarioGrupoImportAction[],
) {
  return digest(
    JSON.stringify({
      cycleId,
      fileHash,
      actions: actions.map(
        ({ grupoId, diaSemana, horaInicio, horaFin, aula, kind }) => ({
          grupoId,
          diaSemana,
          horaInicio,
          horaFin,
          aula,
          kind,
        }),
      ),
    }),
  );
}

function validId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function importProposal(cycleId: number, text: string) {
  const client = obtenerClienteAdmin();
  const { data: cycle, error: cycleError } = await client
    .from("cuatrimestres")
    .select("id,clave,nombre")
    .eq("id", cycleId)
    .maybeSingle();
  if (cycleError) throw new Error(cycleError.message);
  if (!cycle)
    return {
      cycle: null,
      actions: [],
      blockers: [{ row: 1, reason: "cycle_not_found" }],
    };

  const parsed = parseHorariosGrupoCsv(text);
  const { data: groups, error: groupsError } = await client
    .from("grupos")
    .select(
      "id,cuatrimestre_id,activo,clave,grupo_normalizado,asignaturas(clave,nombre)",
    )
    .eq("cuatrimestre_id", cycleId);
  if (groupsError) throw new Error(groupsError.message);
  const groupIds = (groups || []).map((group: any) => group.id);
  const { data: schedules, error: schedulesError } = groupIds.length
    ? await client
        .from("horarios_grupo")
        .select("grupo_id,dia_semana,hora_inicio,hora_fin,aula,activo")
        .in("grupo_id", groupIds)
    : { data: [], error: null };
  if (schedulesError) throw new Error(schedulesError.message);
  const planned = planHorariosGrupoImport({
    cycleId,
    rows: parsed.rows,
    groups: (groups || []).map((group: any) => {
      const subject = Array.isArray(group.asignaturas)
        ? group.asignaturas[0]
        : group.asignaturas;
      return {
        ...group,
        label: `${subject?.clave || group.clave || "Grupo"} · ${group.grupo_normalizado || group.clave || group.id}`,
      };
    }),
    existing: schedules || [],
  });
  return {
    cycle,
    actions: planned.actions,
    blockers: [...parsed.blockers, ...planned.blockers],
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown> = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      return json({ error: "Solicitud JSON inválida" }, 400);
    }
  }
  if (body.action === "save" || body.action === "deactivate") {
    if (body.action === "deactivate") {
      const id = validId(body.id);
      const cycleId = validId(body.cuatrimestre_id);
      if (!id || !cycleId) return json({ error: "Horario inválido" }, 400);
      const { error } = await auth.client.rpc(
        "admin_deactivate_horario_grupo",
        { p_id: id, p_cuatrimestre_id: cycleId },
      );
      return error
        ? json({ error: "No fue posible desactivar el horario." }, 400)
        : json({ success: true });
    }
    const parsed = validateHorarioGrupoInput(body.schedule);
    const cycleId = validId(body.cuatrimestre_id);
    const id =
      body.id === null || body.id === undefined || body.id === ""
        ? null
        : validId(body.id);
    if (
      !cycleId ||
      !parsed.ok ||
      (body.id !== null && body.id !== undefined && body.id !== "" && !id)
    )
      return json(
        { error: parsed.ok ? "Horario inválido" : parsed.error },
        400,
      );
    const { data, error } = await auth.client.rpc("admin_save_horario_grupo", {
      p_id: id,
      p_cuatrimestre_id: cycleId,
      p_grupo_id: parsed.value.grupoId,
      p_dia_semana: parsed.value.diaSemana,
      p_hora_inicio: parsed.value.horaInicio,
      p_hora_fin: parsed.value.horaFin,
      p_aula: parsed.value.aula,
    });
    if (error)
      return json(
        {
          error:
            error.code === "23505"
              ? "Ya existe un horario activo idéntico para este grupo."
              : "No fue posible guardar el horario.",
        },
        400,
      );
    return json({ success: true, schedule: data });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Solicitud de importación inválida" }, 400);
  }
  let mode: string | null;
  try {
    mode = new URL(request.url).searchParams.get("mode");
  } catch {
    return json({ error: "URL de solicitud inválida" }, 400);
  }
  if (mode !== "preview" && mode !== "apply")
    return json({ error: "Modo de importación inválido" }, 400);
  const cycleId = validId(formData.get("cuatrimestre_id"));
  const file = formData.get("file");
  if (
    !cycleId ||
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith(".csv")
  )
    return json({ error: "Seleccione un ciclo y un archivo CSV válido." }, 400);
  if (file.size > 5 * 1024 * 1024)
    return json({ error: "El archivo no debe superar 5 MB." }, 400);

  try {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const fileHash = digest(text);
    const proposal = await importProposal(cycleId, text);
    if (!proposal.cycle)
      return json({ error: "El ciclo seleccionado no existe." }, 400);
    const previewSignature = signature(cycleId, fileHash, proposal.actions);
    if (mode === "preview")
      return json({
        success: true,
        mode,
        cycle: proposal.cycle,
        rowsRead: parseHorariosGrupoCsv(text).rows.length,
        fileHash,
        previewSignature,
        blockers: proposal.blockers,
        actions: proposal.actions,
        summary: {
          create: proposal.actions.filter((action) => action.kind === "create")
            .length,
          noOp: proposal.actions.filter((action) => action.kind === "no-op")
            .length,
          blockers: proposal.blockers.length,
        },
      });
    if (
      formData.get("file_hash") !== fileHash ||
      formData.get("preview_signature") !== previewSignature
    )
      return json(
        {
          error:
            "La vista previa ya no coincide con el archivo o los horarios actuales.",
        },
        409,
      );
    if (proposal.blockers.length)
      return json(
        {
          error: "La propuesta tiene bloqueadores y no puede aplicarse.",
          blockers: proposal.blockers,
        },
        409,
      );
    const { data, error } = await auth.client.rpc(
      "admin_apply_horarios_grupo",
      {
        p_cuatrimestre_id: cycleId,
        p_horarios: proposal.actions.map(
          ({ grupoId, diaSemana, horaInicio, horaFin, aula }) => ({
            grupo_id: grupoId,
            dia_semana: diaSemana,
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            aula,
          }),
        ),
      },
    );
    if (error)
      return json(
        {
          error:
            "No fue posible aplicar los horarios. Genere una nueva vista previa.",
        },
        400,
      );
    return json({ success: true, mode, result: data });
  } catch (error) {
    console.error("[group-schedules] import failed", error);
    return json(
      { error: "No fue posible procesar el archivo de horarios." },
      500,
    );
  }
};
