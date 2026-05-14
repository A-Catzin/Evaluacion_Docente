import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403 });

    const body = await request.json();
    const { action, instrumento, texto, orden, id, activa, tipo_respuesta, opciones } = body;

    if (action === 'create') {
      const { error } = await cl.from('instrumento_preguntas').insert({ instrumento, texto, orden: orden || 1, tipo_respuesta: tipo_respuesta || 'cerrada', opciones: opciones || [] });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    if (action === 'update') {
      const upd: Record<string,unknown> = { texto };
      if (tipo_respuesta) upd.tipo_respuesta = tipo_respuesta;
      if (opciones !== undefined) upd.opciones = opciones;
      const { error } = await cl.from('instrumento_preguntas').update(upd).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (action === 'toggle') {
      const { error } = await cl.from('instrumento_preguntas').update({ activa }).eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (action === 'delete') {
      const { error } = await cl.from('instrumento_preguntas').delete().eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400 });
  } catch { return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 }); }
};
