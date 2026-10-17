import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../../lib/auth';
import { fetchFollowupRows, filterFollowupRows, followupCsv, parseFollowupFilters } from '../../../../lib/studentSurveyFollowup';

// Exports every row matching the page filters (no pagination).
export const GET: APIRoute = async ({ cookies, url }) => {
  let auth;
  try {
    auth = await requireRole(cookies, ['superadmin']);
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response('Error interno', { status: 500 });
  }
  const cycleId = Number.parseInt(url.searchParams.get('cuatrimestre') || '', 10);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return new Response('Ciclo inválido', { status: 400 });
  try {
    const { rows: allRows } = await fetchFollowupRows(auth.client, cycleId);
    const rows = filterFollowupRows(allRows, parseFollowupFilters(url.searchParams));
    return new Response(followupCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="estudiantes-pendientes-ciclo-${cycleId}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('No se pudo generar el archivo', { status: 503 });
  }
};
