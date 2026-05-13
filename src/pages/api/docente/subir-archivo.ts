import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  console.log('[Subir] Inicio');
  try {
    const t = cookies.get('sb-access-token')?.value;
    const r = cookies.get('sb-refresh-token')?.value;
    if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('entidad_id,rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'docente' || !u.entidad_id) return new Response(JSON.stringify({ error: 'Solo docentes' }), { status: 403 });

    const formData = await request.formData();
    const path = formData.get('path') as string;
    const file = formData.get('file') as File;

    console.log('[Subir] path:', path, 'file:', file?.name, file?.size);
    if (!file || !path) return new Response(JSON.stringify({ error: 'Faltan archivo o ruta' }), { status: 400 });

    const buffer = await file.arrayBuffer();
    const { error: upErr } = await cl.storage.from('planeaciones').upload(path, buffer, { contentType: file.type || 'application/pdf', upsert: true });
    if (upErr) { console.error('[Subir] Storage:', upErr); return new Response(JSON.stringify({ error: 'Error Storage: ' + upErr.message }), { status: 400 }); }

    const { data: urlData } = cl.storage.from('planeaciones').getPublicUrl(path);

    const { error: dbErr } = await cl.from('planeaciones').insert({
      docente_id: u.entidad_id,
      cuatrimestre_id: parseInt(formData.get('cuatrimestre') as string),
      asignatura_id: parseInt(formData.get('asignatura') as string) || null,
      grupo: formData.get('grupo') as string,
      modalidad: formData.get('modalidad') as string,
      proyecto: formData.get('proyecto') === 'true',
      laboratorio: formData.get('laboratorio') as string,
      visitas: formData.get('visitas') as string,
      url_pdf: urlData.publicUrl,
      nombre_archivo: (formData.get('nombre') as string) || file.name,
      comentario_docente: (formData.get('comentario') as string) || null,
      campus: formData.get('campus') as string,
      turno: formData.get('turno') as string,
    });

    if (dbErr) {
      console.error('[Subir] DB:', dbErr);
      if (dbErr.code === '23505') return new Response(JSON.stringify({ error: 'Ya existe' }), { status: 409 });
      return new Response(JSON.stringify({ error: 'Error BD: ' + dbErr.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (err) {
    console.error('[Subir] Catch:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
