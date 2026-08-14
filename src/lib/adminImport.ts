import type { APIContext } from 'astro';
import { db } from './db';

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function authorizeSuperadmin(cookies: APIContext['cookies']) {
  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;
  if (!accessToken || !refreshToken) return { error: json({ error: 'No autorizado' }, 401) };

  const client = db();
  const { data: session } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (!session.user) return { error: json({ error: 'Sesión inválida' }, 401) };

  const { data: user } = await client.from('usuarios').select('rol').eq('id', session.user.id).maybeSingle();
  if (!user || user.rol !== 'superadmin') return { error: json({ error: 'Solo superadmin' }, 403) };
  return { client, userId: session.user.id };
}

export async function finishImportRun(client: any, runId: number, summary: Record<string, unknown>, status = 'completed') {
  await client.from('import_runs').update({ status, resumen: summary, finished_at: new Date().toISOString() }).eq('id', runId);
}

export async function saveImportIssues(client: any, runId: number, issues: Record<string, unknown>[]) {
  for (let index = 0; index < issues.length; index += 100) {
    const { error } = await client.from('import_issues').insert(issues.slice(index, index + 100).map(issue => ({ ...issue, run_id: runId })));
    if (error) throw new Error(`No se pudieron guardar las incidencias: ${error.message}`);
  }
}
