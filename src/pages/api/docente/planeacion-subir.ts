import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { validarComentarioOpcional } from '../../../lib/moderation';
import { estaHabilitadoR2, subirArchivo } from '../../../lib/storage';
import {
  logRecalcError,
  recalcularCalificacionDocente,
} from '../../../services/calificaciones';

const BUCKET_PLANEACIONES = 'planeaciones';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = db();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('entidad_id,rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'docente' || !u.entidad_id) return new Response(JSON.stringify({ error: 'Solo docentes' }), { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) return new Response(JSON.stringify({ error: 'Archivo requerido o inválido' }), { status: 400 });
    if (file.size > 5 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Máximo 5 MB. Tu archivo pesa: ' + (file.size/1024/1024).toFixed(2) + ' MB' }), { status: 400 });
    if (file.type !== 'application/pdf') return new Response(JSON.stringify({ error: 'Solo archivos PDF. Tipo recibido: ' + file.type }), { status: 400 });

    const modalidad = formData.get('modalidad') as string;
    if (modalidad !== 'Escolarizada') return new Response(JSON.stringify({ error: 'Solo se aceptan planeaciones en modalidad Escolarizada' }), { status: 400 });

    const path = formData.get('path') as string;
    console.log('[Planeacion Subir] Recibido:', file.name, file.size, 'bytes, path:', path);
    const buffer = await file.arrayBuffer();

    let pdfUrl: string;
    if (estaHabilitadoR2()) {
      const { url } = await subirArchivo(BUCKET_PLANEACIONES, path, buffer, 'application/pdf');
      pdfUrl = url;
    } else {
      const { error: uploadError } = await cl.storage.from('planeaciones').upload(path, buffer, {
        contentType: 'application/pdf', upsert: true
      });
      if (uploadError) {
        console.error('[Planeacion Subir] Error storage:', uploadError);
        return new Response(JSON.stringify({ error: 'Error al subir archivo: ' + uploadError.message }), { status: 400 });
      }
      const { data: urlData } = cl.storage.from('planeaciones').getPublicUrl(path);
      pdfUrl = urlData.publicUrl;
    }

        const comentarioRaw = formData.get('comentario') as string | null;
        const moderacion = validarComentarioOpcional(comentarioRaw, 500);
        if (!moderacion.valido) {
          return new Response(JSON.stringify({ error: moderacion.error, code: 'comment_rejected' }), { status: 400 });
        }

        // Guardar en BD
        const asignaturaId = parseInt(formData.get('asignatura_id') as string);
        const cuatrimestreId = parseInt(formData.get('cuatrimestre_id') as string);
        if (isNaN(asignaturaId) || isNaN(cuatrimestreId)) return new Response(JSON.stringify({ error: 'Asignatura o cuatrimestre inválido' }), { status: 400 });

        // Validar que el docente esté vinculado a esta asignatura via grupos
        const { data: vinc } = await cl.from('grupos').select('id').eq('docente_id', u.entidad_id).eq('asignatura_id', asignaturaId).limit(1);
        if (!vinc || vinc.length === 0) return new Response(JSON.stringify({ error: 'No estás asignado a esta materia' }), { status: 403 });

        const { error: dbError } = await cl.from('planeaciones').insert({
          docente_id: u.entidad_id,
      cuatrimestre_id: cuatrimestreId,
      asignatura_id: asignaturaId,
      grupo: formData.get('grupo') as string,
      modalidad: modalidad,
      proyecto: formData.get('proyecto') === 'true',
      laboratorio: formData.get('laboratorio') as string,
      visitas: formData.get('visitas') as string,
      url_pdf: pdfUrl,
      nombre_archivo: path.split('/').pop() || 'planeacion.pdf',
      comentario_docente: moderacion.valorNormalizado,
      campus: formData.get('campus') as string,
      turno: formData.get('turno') as string,
    });

    if (dbError) {
      if (dbError.code === '23505') return new Response(JSON.stringify({ error: 'Ya subiste una planeación para esta asignatura' }), { status: 409 });
      return new Response(JSON.stringify({ error: 'Error al guardar: ' + dbError.message }), { status: 400 });
    }

    try {
      await recalcularCalificacionDocente(cl, u.entidad_id, cuatrimestreId);
    } catch (recalcError) {
      logRecalcError(u.entidad_id, cuatrimestreId, recalcError);
    }

    // Notificar a coordinadores del docente
    try {
      const { notificarCoordinadoresDocente } = await import('../../../services/notificaciones');
      await notificarCoordinadoresDocente(u.entidad_id, cuatrimestreId, 'Nueva planeación recibida', `El docente ha subido una planeación para la asignatura.`, '/coordinador/planeaciones');
    } catch (err) {
      console.error('[Planeacion Subir] Error notificando coordinadores:', err);
    }

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
