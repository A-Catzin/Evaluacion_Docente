import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { formatScoreCsv } from "../../../services/scoring";
import {
  rowToCalificacion,
  type CalificacionFinal,
} from "../../../services/calificaciones";

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
    if (!u || !["superadmin", "coordinador"].includes(u.rol))
      return new Response("Solo superadmin o coordinador", { status: 403 });

    const cicloIdsParam = url.searchParams.get("ciclos") || "";
    const cicloIds = cicloIdsParam
      .split(",")
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id) && id > 0)
      .slice(0, 3);

    if (!cicloIds.length)
      return new Response(
        JSON.stringify({
          error: "ciclos requerido (1-3 IDs separados por coma)",
        }),
        { status: 400 },
      );

    const { data: cuatris } = await cl
      .from("cuatrimestres")
      .select("id,clave")
      .in("id", cicloIds)
      .order("id");
    if (!cuatris?.length)
      return new Response(
        JSON.stringify({ error: "Cuatrimestres no encontrados" }),
        { status: 404 },
      );

    const cicloIdsValid = cuatris.map((c) => c.id);
    const claves = cuatris.map((c) => c.clave);

    let allDocIds: number[];
    if (u.rol === "superadmin") {
      const { data: allDocs } = await cl
        .from("docentes")
        .select("id")
        .eq("activo", true);
      allDocIds = (allDocs || []).map((d) => d.id);
    } else {
      const { data: asigs } = await cl
        .from("coordinador_docentes")
        .select("docente_id")
        .eq("coordinador_id", s.user.id)
        .in("cuatrimestre_id", cicloIdsValid);
      allDocIds = [...new Set((asigs || []).map((a) => a.docente_id))];
    }

    if (!allDocIds.length) {
      return new Response(
        JSON.stringify({ cuatrimestres: claves, docentes: [] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data: docentes } = await cl
      .from("docentes")
      .select("id,nombre,apellidos,email,campus,modalidad")
      .in("id", allDocIds)
      .order("apellidos");

    const { data: califRows, error: califError } = await cl
      .from("calificaciones_finales")
      .select("*")
      .in("docente_id", allDocIds)
      .in("cuatrimestre_id", cicloIdsValid);

    if (califError) {
      console.error(
        "[reporte-general-coordinador] Error al leer calificaciones_finales:",
        califError,
      );
      return new Response(
        JSON.stringify({ error: "Error al leer calificaciones" }),
        { status: 500 },
      );
    }

    const califPorDocenteCiclo = new Map<
      number,
      Map<number, CalificacionFinal>
    >();
    for (const row of (califRows || []) as Record<string, unknown>[]) {
      const cal = rowToCalificacion(row);
      if (!califPorDocenteCiclo.has(cal.docente_id)) {
        califPorDocenteCiclo.set(cal.docente_id, new Map());
      }
      califPorDocenteCiclo.get(cal.docente_id)!.set(cal.cuatrimestre_id, cal);
    }

    const resultDocentes = (docentes || []).map((d) => {
      const puntajesPorCiclo: Record<string, number | null> = {};
      let sumFinal = 0;
      let countFinal = 0;

      for (const cid of cicloIdsValid) {
        const cal = califPorDocenteCiclo.get(d.id)?.get(cid);
        puntajesPorCiclo[cid] =
          cal && cal.num_instrumentos_completados > 0
            ? cal.calificacion_final
            : null;
        if (puntajesPorCiclo[cid] != null) {
          sumFinal += puntajesPorCiclo[cid]!;
          countFinal++;
        }
      }

      const promedioAnual =
        countFinal > 0 ? Math.round(sumFinal / countFinal) : null;

      return {
        id: d.id,
        nombre: d.nombre,
        apellidos: d.apellidos,
        email: d.email,
        campus: d.campus || "",
        modalidad: d.modalidad || "",
        puntajes: puntajesPorCiclo,
        promedio_anual: promedioAnual,
      };
    });

    const format = url.searchParams.get("format") || "json";

    if (format === "csv") {
      const header = [
        "Nombre",
        "Email",
        "Campus",
        ...claves,
        "Promedio anual",
      ].join(",");
      const rows = resultDocentes.map((d) => {
        const cols = [
          `"${[d.nombre, d.apellidos].filter(Boolean).join(" ")}"`,
          `"${d.email}"`,
          `"${d.campus}"`,
          ...cicloIdsValid.map((cid) => formatScoreCsv(d.puntajes[cid])),
          formatScoreCsv(d.promedio_anual),
        ];
        return cols.join(",");
      });
      const csv = [header, ...rows].join("\n");
      const filename = `reporte_general_${claves.join("_")}.csv`;
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        cuatrimestres: cuatris.map((c) => ({ id: c.id, clave: c.clave })),
        docentes: resultDocentes,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
    });
  }
};
