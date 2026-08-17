import type { APIRoute } from 'astro';
import { authorizeSuperadmin } from '../../../lib/adminImport';
import { RunIdQuerySchema } from '../../../lib/validation/apiSchemas';
import { formatZodFieldErrors } from '../../../lib/validation/errors';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await authorizeSuperadmin(cookies);
  if (auth.error) return auth.error;
    let runId: number;
    try {
      const runParse = RunIdQuerySchema.safeParse({ run_id: new URL(request.url).searchParams.get('run_id') });
      if (!runParse.success) {
        return new Response(JSON.stringify({ error: 'run_id inválido', detalles: formatZodFieldErrors(runParse.error) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      runId = runParse.data.run_id;
    } catch {
      return new Response(JSON.stringify({ error: 'run_id inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  const { data: run, error } = await auth.client.from('import_runs').select('id,tipo,archivo_nombre,cuatrimestre_id,estado,resumen,created_at,finished_at,cuatrimestres(clave,nombre)').eq('id', runId).maybeSingle();
  if (error || !run) return new Response('Importación no encontrada', { status: 404 });
  const { data: issues } = await auth.client.from('import_issues').select('*').eq('run_id', runId).order('id');
  const rows = (issues || []).map(item => `<tr><td>${escapeHtml(item.fila)}</td><td>${escapeHtml(item.categoria)}</td><td>${escapeHtml(item.razon)}</td><td>${escapeHtml(item.plan)}</td><td>${escapeHtml(item.grupo)}</td><td>${escapeHtml(item.clave_asignatura)} · ${escapeHtml(item.nombre_asignatura)}</td><td>${escapeHtml(item.docente)}</td><td>${escapeHtml(item.valor_original)}</td><td>${escapeHtml(item.valor_normalizado)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de importación ${run.id}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h1{margin-bottom:4px}p{color:#526071}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.card{background:#f1f5f9;border-radius:8px;padding:12px 16px}.card b{display:block;font-size:20px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}th{background:#e2e8f0}@media print{.print{display:none}body{margin:12px}}</style></head><body><button class="print" onclick="window.print()">Imprimir / Guardar como PDF</button><h1>Reporte de importación #${escapeHtml(run.id)}</h1><p>Flujo: ${escapeHtml(run.tipo)} · Archivo: ${escapeHtml(run.archivo_nombre)} · Ciclo: ${escapeHtml((run.cuatrimestres as any)?.clave || 'No aplica')}</p><div class="summary">${Object.entries(run.resumen || {}).map(([key, value]) => `<div class="card">${escapeHtml(key)}<b>${escapeHtml(value)}</b></div>`).join('')}</div><h2>Incidencias para revisión (${issues?.length || 0})</h2>${issues?.length ? `<table><thead><tr><th>Fila</th><th>Categoría</th><th>Razón</th><th>Plan</th><th>Grupo</th><th>Asignatura</th><th>Docente</th><th>Original</th><th>Normalizado</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No hay incidencias registradas.</p>'}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
