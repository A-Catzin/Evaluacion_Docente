import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { formatScoreCsv } from "../../../services/scoring";
import {
  rowToCalificacion,
  type CalificacionFinal,
} from "../../../services/calificaciones";

export const GET: APIRoute = async ({ url, cookies }) => {
  const docenteId = parseInt(url.searchParams.get("docente_id") || "");
  if (!docenteId)
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });

  const cl = db();
  const token = cookies.get("sb-access-token")?.value;
  const refresh = cookies.get("sb-refresh-token")?.value;
  if (!token || !refresh) return new Response("No autorizado", { status: 401 });
  const { data: session } = await cl.auth.setSession({
    access_token: token,
    refresh_token: refresh,
  });
  if (!session.user) return new Response("Sesión inválida", { status: 401 });

  const { data: cuatris } = await cl
    .from("cuatrimestres")
    .select("id,clave")
    .order("id");
  if (!cuatris?.length)
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });

  const cuatrimestreIds = cuatris.map((c) => c.id);
  const clavesPorId = new Map(cuatris.map((c) => [c.id, c.clave]));

  const { data: califRows, error: califError } = await cl
    .from("calificaciones_finales")
    .select("*")
    .eq("docente_id", docenteId)
    .in("cuatrimestre_id", cuatrimestreIds);

  if (califError) {
    console.error(
      "[historial-docente] Error al leer calificaciones_finales:",
      califError,
    );
    return new Response(
      JSON.stringify({ error: "Error al leer calificaciones" }),
      { status: 500 },
    );
  }

  const califPorCiclo = new Map<number, CalificacionFinal>();
  for (const row of (califRows || []) as Record<string, unknown>[]) {
    const cal = rowToCalificacion(row);
    califPorCiclo.set(cal.cuatrimestre_id, cal);
  }

  const historial: any[] = [];
  let totalCycles = 0;
  let sumFinals = 0;

  for (const cid of cuatrimestreIds) {
    const cal = califPorCiclo.get(cid);
    if (cal && cal.num_instrumentos_completados > 0) {
      historial.push({
        clave: clavesPorId.get(cid),
        ee: cal.score_encuesta_estudiantil,
        coord: cal.score_coordinacion,
        plan: cal.score_planeacion,
        obs: cal.score_observacion,
        auto: cal.score_autoevaluacion,
        final: cal.calificacion_final,
        cat: cal.categoria_final,
        inst: cal.num_instrumentos_completados,
        expected: cal.num_instrumentos_esperados,
      });
      totalCycles++;
      sumFinals += cal.calificacion_final;
    }
  }

  const annualAvg = totalCycles > 0 ? Math.round(sumFinals / totalCycles) : 0;

  const format = url.searchParams.get("format") || "json";
  if (format === "csv") {
    const header =
      "Cuatrimestre,EE,Coordinación,Planeación,Observación,Autodiagnóstico,Final,Categoría,Instrumentos";
    const rows = historial.map(
      (h) =>
        `${h.clave},${formatScoreCsv(h.ee)},${formatScoreCsv(h.coord)},${formatScoreCsv(h.plan)},${formatScoreCsv(h.obs)},${formatScoreCsv(h.auto)},${formatScoreCsv(h.final)},"${h.cat}",${h.inst}/${h.expected}`,
    );
    const allRows = [
      ...rows,
      `Promedio anual,,,,,,${formatScoreCsv(annualAvg)},,"${totalCycles} ciclo${totalCycles === 1 ? "" : "s"}"`,
    ];
    const csv = [header, ...allRows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="reporte_anual.csv"',
      },
    });
  }

  return new Response(
    JSON.stringify({
      historial,
      annual_avg: annualAvg,
      total_cycles: totalCycles,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
