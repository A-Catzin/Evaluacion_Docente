import type { APIRoute } from "astro";
import { authorizeSuperadmin } from "../../../lib/adminImport";
import { RunIdQuerySchema } from "../../../lib/validation/apiSchemas";
import { formatZodFieldErrors } from "../../../lib/validation/errors";

export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;

  let runIdParam: string | null;
  try {
    runIdParam = new URL(request.url).searchParams.get("run_id");
  } catch {
    return new Response(JSON.stringify({ error: "URL inválida" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  const { data: issues } = await auth.client
    .from("import_issues")
    .select("*")
    .eq("run_id", runId)
    .order("id");

  return new Response(JSON.stringify({ run, issues: issues || [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
