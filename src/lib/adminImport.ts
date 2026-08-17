import type { APIContext } from "astro";
import { AuthError, requireRole } from "./auth";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function authorizeSuperadmin(cookies: APIContext["cookies"]) {
  try {
    const { user, client } = await requireRole(cookies, ["superadmin"]);
    return { client, userId: user.id };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.response };
    console.error("[authorizeSuperadmin] unexpected error", error);
    return { error: json({ error: "Error interno" }, 500) };
  }
}

export async function finishImportRun(
  client: any,
  runId: number,
  summary: Record<string, unknown>,
  status = "completed",
) {
  await client
    .from("import_runs")
    .update({ status, resumen: summary, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

export async function saveImportIssues(
  client: any,
  runId: number,
  issues: Record<string, unknown>[],
) {
  for (let index = 0; index < issues.length; index += 100) {
    const { error } = await client
      .from("import_issues")
      .insert(
        issues
          .slice(index, index + 100)
          .map((issue) => ({ ...issue, run_id: runId })),
      );
    if (error)
      throw new Error(
        `No se pudieron guardar las incidencias: ${error.message}`,
      );
  }
}
