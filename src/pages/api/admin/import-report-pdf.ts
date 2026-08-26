import type { APIRoute } from "astro";
import path from "path";
import fs from "fs";
import { authorizeSuperadmin } from "../../../lib/adminImport";
import { RunIdQuerySchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

// @ts-expect-error: pdfmake no expone tipos oficiales para ESM/Node
import pdfMake from "pdfmake";

const FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "pdfmake",
  "fonts",
  "Roboto",
);

const FONT_FILES = {
  "Roboto-Regular.ttf": path.join(FONT_DIR, "Roboto-Regular.ttf"),
  "Roboto-Medium.ttf": path.join(FONT_DIR, "Roboto-Medium.ttf"),
  "Roboto-Italic.ttf": path.join(FONT_DIR, "Roboto-Italic.ttf"),
  "Roboto-MediumItalic.ttf": path.join(FONT_DIR, "Roboto-MediumItalic.ttf"),
};

function loadFonts() {
  const descriptors: Record<string, string> = {};
  for (const [alias, filePath] of Object.entries(FONT_FILES)) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fuente no encontrada: ${filePath}`);
    }
    descriptors[alias] = filePath;
  }
  return {
    Roboto: {
      normal: descriptors["Roboto-Regular.ttf"],
      bold: descriptors["Roboto-Medium.ttf"],
      italics: descriptors["Roboto-Italic.ttf"],
      bolditalics: descriptors["Roboto-MediumItalic.ttf"],
    },
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;

  let runIdParam: string | null;
  try {
    runIdParam = new URL(request.url).searchParams.get("run_id");
  } catch {
    return new Response(
      JSON.stringify({ error: "URL inválida" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const runParse = RunIdQuerySchema.safeParse({ run_id: runIdParam });
  if (!runParse.success) {
    return new Response(
      JSON.stringify({
        error: "run_id inválido",
        detalles: formatZodFieldErrors(runParse.error),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const runId = runParse.data.run_id;

  const { data: run, error } = await auth.client
    .from("import_runs")
    .select(
      "id,tipo,archivo_nombre,cuatrimestre_id,estado,resumen,created_at,finished_at,cuatrimestres(clave,nombre)",
    )
    .eq("id", runId)
    .maybeSingle();

  if (error || !run) {
    return new Response(
      JSON.stringify({ error: "Importación no encontrada" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (run.tipo !== "docentes") {
    return new Response(
      JSON.stringify({ error: "El run no corresponde a una importación de docentes" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: issues } = await auth.client
    .from("import_issues")
    .select("*")
    .eq("run_id", runId)
    .order("id");

  const cuatrimestre = (run.cuatrimestres as any)?.clave || "No aplica";
  const resumen = (run.resumen || {}) as Record<string, unknown>;
  const issueRows = (issues || []) as any[];

  try {
    const fonts = loadFonts();
    (pdfMake as any).setFonts(fonts);
    (pdfMake as any).setLocalAccessPolicy(() => true);
  } catch (fontError) {
    console.error("[import-report-pdf] error cargando fuentes", fontError);
    return new Response(
      JSON.stringify({ error: "No se pudieron cargar las fuentes del PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const issueTable = issueRows.length
    ? {
        table: {
          headerRows: 1,
          widths: ["auto", "auto", "auto", "auto", "*", "*"],
          body: [
            [
              { text: "Fila", style: "tableHeader" },
              { text: "Categoría", style: "tableHeader" },
              { text: "Razón", style: "tableHeader" },
              { text: "Docente", style: "tableHeader" },
              { text: "Original", style: "tableHeader" },
              { text: "Normalizado", style: "tableHeader" },
            ],
            ...issueRows.map((item) => [
              String(item.fila ?? ""),
              String(item.categoria ?? ""),
              String(item.razon ?? ""),
              String(item.docente ?? ""),
              String(item.valor_original ?? ""),
              String(item.valor_normalizado ?? ""),
            ]),
          ],
        },
        layout: {
          fillColor: (i: number) => (i === 0 ? "#1e3a5f" : i % 2 === 0 ? "#f8fafc" : null),
        },
      }
    : { text: "No hay incidencias registradas.", style: "muted" };

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [30, 60, 30, 40],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#172033" },
    header: {
      columns: [
        { text: "SED-360", alignment: "left", style: "brand" },
        { text: formatDate(run.created_at), alignment: "right", style: "muted" },
      ],
      margin: [30, 20, 30, 0],
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Reporte generado automáticamente", style: "muted" },
        { text: `Página ${currentPage} de ${pageCount}`, alignment: "right", style: "muted" },
      ],
      margin: [30, 0, 30, 20],
    }),
    content: [
      { text: "Reporte de importación de docentes", style: "title" },
      {
        text: [
          { text: "Run #", style: "label" },
          `${run.id} · `,
          { text: "Archivo: ", style: "label" },
          `${run.archivo_nombre || "—"} · `,
          { text: "Ciclo: ", style: "label" },
          cuatrimestre,
        ],
        margin: [0, 0, 0, 16],
      },
      {
        columns: Object.entries(resumen).map(([key, value]) => ({
          width: "*",
          stack: [
            { text: key, style: "label" },
            { text: String(value), style: "metric" },
          ],
        })),
        columnGap: 12,
        margin: [0, 0, 0, 20],
      },
      { text: `Incidencias para revisión (${issueRows.length})`, style: "section" },
      issueTable,
    ],
    styles: {
      brand: { fontSize: 10, bold: true, color: "#1e3a5f" },
      title: { fontSize: 18, bold: true, color: "#1e3a5f", margin: [0, 0, 0, 6] },
      section: { fontSize: 13, bold: true, color: "#1e3a5f", margin: [0, 14, 0, 8] },
      label: { fontSize: 9, color: "#526071", bold: false },
      metric: { fontSize: 16, bold: true, color: "#172033" },
      muted: { fontSize: 9, color: "#526071", italics: true },
      tableHeader: { bold: true, color: "#ffffff" },
    },
  };

  try {
    const pdfDoc = (pdfMake as any).createPdf(docDefinition);
    const buffer: Buffer = await pdfDoc.getBuffer();
    const filename = `importe-docentes-run-${run.id}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (pdfError) {
    console.error("[import-report-pdf] error generando PDF", pdfError);
    return new Response(
      JSON.stringify({ error: "No se pudo generar el PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
