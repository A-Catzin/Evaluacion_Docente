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
    const { data: u } = await cl.from('usuarios').select('entidad_id,rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'docente' || !u.entidad_id) return new Response(JSON.stringify({ error: 'Solo docentes' }), { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return new Response(JSON.stringify({ error: 'Archivo requerido' }), { status: 400 });
    if (file.size > 5 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Máximo 5 MB' }), { status: 400 });

    const path = formData.get('path') as string;
    const buffer = await file.arrayBuffer();

    // Subir a Supabase Storage
    const { error: uploadError } = await cl.storage.from('planeaciones').upload(path, buffer, {
      contentType: 'application/pdf', upsert: true
    });
    if (uploadError) return new Response(JSON.stringify({ error: 'Error al subir archivo: ' + uploadError.message }), { status: 400 });

    const { data: urlData } = cl.storage.from('planeaciones').getPublicUrl(path);

    // Guardar en BD
    const asignaturaId = parseInt(formData.get('asignatura_id') as string);
    const { error: dbError } = await cl.from('planeaciones').insert({
      docente_id: u.entidad_id,
      cuatrimestre_id: parseInt(formData.get('cuatrimestre_id') as string),
      asignatura_id: isNaN(asignaturaId) ? null : asignaturaId,
      grupo: formData.get('grupo') as string,
      modalidad: formData.get('modalidad') as string,
      proyecto: formData.get('proyecto') === 'true',
      laboratorio: formData.get('laboratorio') as string,
      visitas: formData.get('visitas') as string,
      url_pdf: urlData.publicUrl,
      nombre_archivo: path.split('/').pop() || 'planeacion.pdf',
      comentario_docente: (formData.get('comentario') as string) || null,
      campus: formData.get('campus') as string,
      turno: formData.get('turno') as string,
    });

    if (dbError) {
      if (dbError.code === '23505') return new Response(JSON.stringify({ error: 'Ya subiste una planeación para esta asignatura' }), { status: 409 });
      return new Response(JSON.stringify({ error: 'Error al guardar: ' + dbError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
