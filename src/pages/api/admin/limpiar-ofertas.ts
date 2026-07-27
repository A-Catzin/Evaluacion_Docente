import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';

export const POST: APIRoute = async ({ cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo superadmin' }), { status: 403 });

    const { data: ofertas } = await cl.from('ofertas_academicas').select('id,nombre').order('id');
    if (!ofertas) return new Response(JSON.stringify({ cleaned: 0 }), { status: 200 });

    // Agrupar por nombre normalizado (lowercase, sin acentos extra)
    const grupos = new Map<string, { id: number; nombre: string }[]>();
    for (const o of ofertas) {
      const key = o.nombre.toLowerCase().trim();
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(o);
    }

    let cleaned = 0;
    const borrados: string[] = [];

    for (const [, items] of grupos) {
      if (items.length <= 1) continue;
      // Quedarse con el de mejor formato (más minúsculas = más legible)
      items.sort((a, b) => {
        const ca = (a.nombre.match(/[a-záéíóúñ]/g) || []).length;
        const cb = (b.nombre.match(/[a-záéíóúñ]/g) || []).length;
        return cb - ca;
      });
      const keeper = items[0];
      const dupes = items.slice(1);

      for (const dupe of dupes) {
        // Reasignar FKs en asignaturas
        await cl.from('asignaturas').update({ oferta_academica_id: keeper.id }).eq('oferta_academica_id', dupe.id);
        // Eliminar duplicado
        const { error } = await cl.from('ofertas_academicas').delete().eq('id', dupe.id);
        if (!error) {
          cleaned++;
          borrados.push(dupe.nombre);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, cleaned, borrados }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
