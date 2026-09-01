import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../lib/auth';
import { estaHabilitadoR2, obtenerUrlPublica } from '../../lib/storage';

const ROLES = ['superadmin', 'coordinador', 'docente', 'estudiante', 'observador'];

export const GET: APIRoute = async ({ cookies, url }) => {
  try {
    const { client } = await requireRole(cookies, ROLES);
    const rawCycle = url.searchParams.get('cuatrimestre_id');
    const cycle = rawCycle ? Number.parseInt(rawCycle, 10) : null;
    if (rawCycle && (!Number.isSafeInteger(cycle) || !cycle || cycle <= 0)) {
      return new Response(JSON.stringify({ error: 'Ciclo inválido' }), { status: 400 });
    }
    const { data, error } = await client.rpc('institutional_notice_list', { p_cuatrimestre_id: cycle });
    if (error) throw error;
    const notices = (data || []).map((notice: any) => ({
      ...notice,
      image_url: notice.image_path && estaHabilitadoR2() ? obtenerUrlPublica(notice.image_path) : null,
    }));
    return new Response(JSON.stringify({ notices }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: 'No fue posible consultar los avisos' }), { status: 500 });
  }
};
