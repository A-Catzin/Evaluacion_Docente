import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../lib/auth';
import { eliminarArchivo, estaHabilitadoR2 } from '../../../lib/storage';
import { parseTestCycleDeletionRequest, parseTestCycleId } from '../../../lib/testCycleDeletion';
import { describeTestCycleDeletionFailure } from '../../../lib/testCycleDeletionError';
import { resolveManagedStorageObject, type StorageCleanupEntry } from '../../../lib/testCycleStorage';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function clearManagedStorage(client: any, deletedCycleId: number) {
  const { data, error } = await client.rpc('test_cycle_storage_cleanup_pending', {
    p_deleted_cycle_id: deletedCycleId,
  });
  if (error || !data) return { completed: 0, pending: 0 };

  let completed = 0;
  for (const rawEntry of data as Array<StorageCleanupEntry & { id: number }>) {
    const object = resolveManagedStorageObject(rawEntry, {
      r2Enabled: estaHabilitadoR2(),
      r2PublicUrl: import.meta.env.R2_PUBLIC_URL,
      supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
    });
    let success = false;
    try {
      if (!object) throw new Error('Unmanaged storage reference');
      if (object.provider === 'r2') {
        await eliminarArchivo(object.bucket, object.key);
      } else {
        const { error: storageError } = await client.storage.from(object.bucket).remove([object.key]);
        if (storageError) throw storageError;
      }
      success = true;
      completed += 1;
    } catch (error) {
      console.error('[test cycle storage cleanup] failed', error);
    }
    await client.rpc('complete_test_cycle_storage_cleanup', { p_id: rawEntry.id, p_success: success });
  }
  return { completed, pending: data.length - completed };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let client: any;
  try {
    ({ client } = await requireRole(cookies, ['superadmin']));
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return json({ error: 'Error interno' }, 500);
  }

  try {
    const body = await request.json();
    const { action, id, clave, nombre, fecha_inicio, fecha_fin, activo, cerrado } = body;

    if (action === 'create') {
      if (!clave) return json({ error: 'Clave requerida' }, 400);
      const { error } = await client.from('cuatrimestres').insert({ clave, nombre, fecha_inicio, fecha_fin, activo: activo ?? true, cerrado: cerrado ?? false });
      if (error) return json({ error: error.code === '23505' ? 'La clave ya existe' : error.message }, 400);
      return json({ success: true }, 201);
    }
    if (action === 'update') {
      if (!id || !nombre) return json({ error: 'ID y nombre requeridos' }, 400);
      const { error } = await client.from('cuatrimestres').update({ nombre, fecha_inicio, fecha_fin, activo, cerrado }).eq('id', id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
    if (action === 'mark_test') {
      const parsed = parseTestCycleDeletionRequest(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const { error } = await client.rpc('mark_test_cycle', {
        p_cuatrimestre_id: parsed.value.id,
        p_confirmation: parsed.value.confirmation,
      });
      if (error) return json(describeTestCycleDeletionFailure(error), 400);
      return json({ success: true });
    }
    if (action === 'test_delete_preview') {
      const parsed = parseTestCycleId(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const { data, error } = await client.rpc('test_cycle_deletion_preview', { p_cuatrimestre_id: parsed.value });
      if (error) return json(describeTestCycleDeletionFailure(error), 400);
      return json({ success: true, summary: data });
    }
    if (action === 'delete_test') {
      const parsed = parseTestCycleDeletionRequest(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const { data, error } = await client.rpc('delete_test_cycle', {
        p_cuatrimestre_id: parsed.value.id,
        p_confirmation: parsed.value.confirmation,
      });
      if (error) {
        const failure = describeTestCycleDeletionFailure(error);
        return json(failure, failure.code === 'test_cycle_retryable' ? 503 : 400);
      }
      const cleanup = await clearManagedStorage(client, parsed.value.id);
      return json({ success: true, summary: data, storage_cleanup: cleanup });
    }
    if (action === 'retry_test_storage_cleanup') {
      const parsed = parseTestCycleId(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      return json({ success: true, storage_cleanup: await clearManagedStorage(client, parsed.value) });
    }
    if (action === 'activate') {
      if (!id) return json({ error: 'ID requerido' }, 400);
      const { data: cuatri } = await client.from('cuatrimestres').select('cerrado').eq('id', id).maybeSingle();
      if (!cuatri) return json({ error: 'Cuatrimestre no encontrado' }, 404);
      if ((cuatri as any).cerrado) return json({ error: 'No se puede activar un cuatrimestre cerrado' }, 400);

      await client.from('cuatrimestres').update({ activo: false }).neq('id', id);
      const { error } = await client.from('cuatrimestres').update({ activo: true, cerrado: false }).eq('id', id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
    if (action === 'close') {
      if (!id) return json({ error: 'ID requerido' }, 400);
      const { error } = await client.from('cuatrimestres').update({ cerrado: true, activo: false }).eq('id', id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
    return json({ error: 'Acción no válida' }, 400);
  } catch {
    return json({ error: 'Error interno' }, 500);
  }
};
