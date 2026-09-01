import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../lib/auth';
import { validarComentarioOpcional } from '../../../lib/moderation';
import { validateNoticeImage } from '../../../lib/noticeImages';
import { estaHabilitadoR2, subirArchivo } from '../../../lib/storage';

const ROLES = ['superadmin', 'coordinador', 'docente', 'estudiante', 'observador'];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function positiveInteger(value: FormDataEntryValue | null): number | null {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  let client;
  try {
    ({ client } = await requireRole(cookies, ['superadmin']));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: 'Error interno' }, 500);
  }

  try {
    const form = await request.formData();
    const action = form.get('action');
    const id = positiveInteger(form.get('id'));
    if (action === 'delete') {
      if (!id) return json({ error: 'Aviso inválido' }, 400);
      const { error } = await client.rpc('institutional_notice_delete', { p_id: id });
      if (error) return json({ error: 'No fue posible eliminar el aviso' }, 400);
      return json({ success: true });
    }

    const title = String(form.get('title') || '').trim();
    const body = String(form.get('body') || '').trim();
    const titleValidation = validarComentarioOpcional(title, 160);
    const bodyValidation = validarComentarioOpcional(body, 4000);
    if (!title || !body || !titleValidation.valido || !bodyValidation.valido) {
      return json({ error: titleValidation.error || bodyValidation.error || 'El título y el contenido son obligatorios.' }, 400);
    }
    const targetRoles = form.getAll('target_roles').filter((role): role is string => typeof role === 'string' && ROLES.includes(role));
    if (targetRoles.length !== form.getAll('target_roles').length) return json({ error: 'Rol de destino inválido' }, 400);
    const cycleValue = form.get('cuatrimestre_id');
    const cuatrimestreId = cycleValue ? positiveInteger(cycleValue) : null;
    if (cycleValue && !cuatrimestreId) return json({ error: 'Ciclo inválido' }, 400);
    const requestedStatus = form.get('status');
    const status = requestedStatus === 'published' || requestedStatus === 'archived' ? requestedStatus : 'draft';
    const expiresRaw = String(form.get('expires_at') || '').trim();
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    if (expiresRaw && (!expiresAt || Number.isNaN(expiresAt.getTime()))) return json({ error: 'Fecha de vencimiento inválida' }, 400);

    let existing: any = null;
    if (id) {
      const { data, error } = await client.rpc('institutional_notice_admin_list');
      if (error) throw error;
      existing = (data || []).find((notice: any) => Number(notice.id) === id);
      if (!existing) return json({ error: 'Aviso no encontrado' }, 404);
    }
    let imagePath = existing?.image_path || null;
    let imageAltText = imagePath ? String(form.get('image_alt_text') || '').trim() : null;
    const image = form.get('image');
    if (image instanceof File && image.size > 0) {
      const imageValidation = validateNoticeImage(image);
      if (!imageValidation.ok) return json({ error: imageValidation.error }, 400);
      if (!estaHabilitadoR2()) return json({ error: 'El almacenamiento institucional no está disponible.' }, 503);
      imagePath = `avisos/${crypto.randomUUID()}.${imageValidation.extension}`;
      await subirArchivo(imagePath, await image.arrayBuffer(), image.type);
      imageAltText = String(form.get('image_alt_text') || '').trim();
    } else if (form.get('remove_image') === 'true') {
      imagePath = null;
      imageAltText = null;
    }
    if (imagePath && !imageAltText) return json({ error: 'El texto alternativo es obligatorio para la imagen.' }, 400);
    if (!imagePath && form.get('image_alt_text')) return json({ error: 'El texto alternativo sólo puede registrarse con una imagen.' }, 400);

    const { data, error } = await client.rpc('institutional_notice_save', {
      p_id: id,
      p_title: titleValidation.valorNormalizado,
      p_body: bodyValidation.valorNormalizado,
      p_target_roles: targetRoles,
      p_cuatrimestre_id: cuatrimestreId,
      p_image_path: imagePath,
      p_image_alt_text: imageAltText,
      p_status: status,
      p_is_active: form.get('is_active') === 'true',
      p_expires_at: expiresAt?.toISOString() || null,
    });
    if (error) return json({ error: 'No fue posible guardar el aviso' }, 400);
    return json({ success: true, id: data });
  } catch (error) {
    console.error('[institutional notices] save failed', error);
    return json({ error: 'Error interno' }, 500);
  }
};
