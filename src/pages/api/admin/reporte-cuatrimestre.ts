import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { formatScoreCsv } from "../../../services/scoring";
import { obtenerCalificacionesPorCuatrimestre } from "../../../services/calificaciones";
import { getMyAssignedTeacherIds } from "../../../lib/teacherAssignments";

export const GET: APIRoute = async ({ url, cookies }) => {
  const t = cookies.get("sb-access-token")?.value;
  const r = cookies.get("sb-refresh-token")?.value;
  if (!t || !r) return new Response("No autorizado", { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({
      access_token: t,
      refresh_token: r,
    });
    if (!s.user) return new Response("Sesión inválida", { status: 401 });
    const { data: u } = await cl
      .from("usuarios")
      .select("rol")
      .eq("id", s.user.id)
      .maybeSingle();
    if (!u || (u.rol !== "superadmin" && u.rol !== "coordinador"))
      return new Response("Solo superadmin o coordinador", { status: 403 });

    const cuatrimestreId = parseInt(
      url.searchParams.get("cuatrimestre_id") || "",
    );
    if (!cuatrimestreId)
      return new Response(
        JSON.stringify({ error: "cuatrimestre_id requerido" }),
        { status: 400 },
      );

    const { data: cuatri } = await cl
      .from("cuatrimestres")
      .select("clave")
      .eq("id", cuatrimestreId)
      .maybeSingle();

    let docIds: number[];
    if (u.rol === "superadmin") {
      const { data: allDocs } = await cl
        .from("docentes")
        .select("id")
        .eq("activo", true);
      docIds = (allDocs || []).map((d) => d.id);
    } else {
      docIds = [...await getMyAssignedTeacherIds(cl, "coordinated", cuatrimestreId)];
    }

    const { data: docentes } = docIds.length
      ? await cl
          .from("docentes")
          .select("id,nombre,apellidos,email,modalidad")
          .in("id", docIds)
          .order("apellidos")
      : { data: [] };

    const calificaciones = await obtenerCalificacionesPorCuatrimestre(
      cl,
      cuatrimestreId,
    );
    const califPorDocente = new Map(
      calificaciones.map((cal) => [cal.docente_id, cal]),
    );

    const header =
      "Nombre,Apellidos,Email,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos";
    const rows: string[] = [];
    for (const d of docentes || []) {
      const cal = califPorDocente.get(d.id);
      rows.push(
        `"${d.nombre}","${d.apellidos}","${d.email}",${formatScoreCsv(cal?.score_encuesta_estudiantil)},${formatScoreCsv(cal?.score_coordinacion)},${formatScoreCsv(cal?.score_planeacion)},${formatScoreCsv(cal?.score_observacion)},${formatScoreCsv(cal?.score_autoevaluacion)},${cal && cal.num_instrumentos_completados > 0 ? formatScoreCsv(cal.calificacion_final) : "—"},"${cal?.categoria_final ?? "No iniciado"}",${cal ? `${cal.num_instrumentos_completados}/${cal.num_instrumentos_esperados}` : "0/5"}`,
      );
    }

    const csv = [header, ...rows].join("\n");
    const filename = `reporte_${cuatri?.clave || cuatrimestreId}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Error interno", { status: 500 });
  }
};
