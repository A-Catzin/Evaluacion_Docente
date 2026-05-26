import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo superadmin' }), { status: 403 });

    const body = await request.json();
    const { nombre_completo, email, rol, docente_ids } = body;
    if (!email || !email.endsWith('@tecplayacar.edu.mx')) return new Response(JSON.stringify({ error: 'Email debe ser @tecplayacar.edu.mx' }), { status: 400 });
    if (!['superadmin','coordinador','docente'].includes(rol)) return new Response(JSON.stringify({ error: 'Rol no válido' }), { status: 400 });

    // 1. Crear usuario en auth.users
    const { data: authUser, error: authErr } = await cl.auth.admin.createUser({ email, password: 'TecPlayacar2026!', email_confirm: true });
    if (authErr) return new Response(JSON.stringify({ error: authErr.message }), { status: 400 });
    if (!authUser.user) return new Response(JSON.stringify({ error: 'No se pudo crear' }), { status: 400 });

    // 2. Actualizar rol en usuarios
    await cl.from('usuarios').upsert({ id: authUser.user.id, email, rol }, { onConflict: 'id' });

    // 3. Si es docente, crear en docentes
    if (rol === 'docente') {
      const partes = (nombre_completo || email.split('@')[0]).split(' ');
      const ap = partes.length >= 2 ? partes.slice(0, 2).join(' ') : '';
      const nom = partes.length >= 3 ? partes.slice(2).join(' ') : partes[0] || '';
      const { data: doc } = await cl.from('docentes').insert({ nombre: nom, apellidos: ap, email, activo: true }).select('id').single();
      if (doc) await cl.from('usuarios').update({ entidad_id: doc.id }).eq('id', authUser.user.id);
    }

    // 4. Si es coordinador, vincular docentes
    if (rol === 'coordinador' && docente_ids?.length > 0) {
      for (const did of docente_ids) {
        await cl.from('coordinador_docentes').upsert({ coordinador_id: authUser.user.id, docente_id: did }, { onConflict: 'coordinador_id,docente_id' });
      }
    }

    return new Response(JSON.stringify({ success: true, id: authUser.user.id }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
