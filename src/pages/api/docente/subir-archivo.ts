import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  console.log('[Subir] Iniciando...');
  try {
    const t = cookies.get('sb-access-token')?.value;
    const r = cookies.get('sb-refresh-token')?.value;
    console.log('[Subir] Cookies:', !!t, !!r);
    if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    console.log('[Subir] Sesión:', !!s.user);
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('entidad_id,rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'docente' || !u.entidad_id) return new Response(JSON.stringify({ error: 'Solo docentes' }), { status: 403 });

    // Leer el archivo como ArrayBuffer
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0) return new Response(JSON.stringify({ error: 'Archivo vacío' }), { status: 400 });

    // Metadata desde query params
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    const nombreArchivo = url.searchParams.get('nombre') || 'planeacion.pdf';
    const cuatrimestreId = parseInt(url.searchParams.get('cuatrimestre') || '0');
    const asignaturaId = parseInt(url.searchParams.get('asignatura') || '0');
    const grupo = url.searchParams.get('grupo') || '';
    const modalidad = url.searchParams.get('modalidad') || '';
    const proyecto = url.searchParams.get('proyecto') === 'true';
    const laboratorio = url.searchParams.get('laboratorio') || '';
    const visitas = url.searchParams.get('visitas') || '';
    const comentario = url.searchParams.get('comentario') || null;
    const campus = url.searchParams.get('campus') || '';
    const turno = url.searchParams.get('turno') || '';

    if (!path || !grupo) return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), { status: 400 });

    // Subir a Supabase Storage (usa service_role via cliente del servidor)
    const { error: uploadError } = await cl.storage.from('planeaciones').upload(path, buffer, {
      contentType: 'application/pdf', upsert: true
    });
    if (uploadError) {
      console.error('[Subir] Error storage:', uploadError);
      return new Response(JSON.stringify({ error: 'Error Storage: ' + uploadError.message }), { status: 400 });
    }

    const { data: urlData } = cl.storage.from('planeaciones').getPublicUrl(path);

    // Guardar en BD
    const { error: dbError } = await cl.from('planeaciones').insert({
      docente_id: u.entidad_id, cuatrimestre_id: cuatrimestreId, asignatura_id: isNaN(asignaturaId) ? null : asignaturaId,
      grupo, modalidad, proyecto, laboratorio, visitas,
      url_pdf: urlData.publicUrl, nombre_archivo: nombreArchivo,
      comentario_docente: comentario, campus, turno,
    });

    if (dbError) {
      if (dbError.code === '23505') return new Response(JSON.stringify({ error: 'Ya subiste una planeación para esta asignatura' }), { status: 409 });
      return new Response(JSON.stringify({ error: 'Error BD: ' + dbError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, url: urlData.publicUrl }), { status: 201 });
  } catch (err) {
    console.error('[Subir] Error:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
