import { db, dbAdmin } from '../lib/db';

export async function crearNotificacion(data: {
  usuario_id: string;
  titulo: string;
  mensaje: string;
  url?: string;
  tipo?: string;
}): Promise<void> {
  const cl = dbAdmin();
  const { error } = await cl.from('notificaciones').insert({
    usuario_id: data.usuario_id,
    titulo: data.titulo,
    mensaje: data.mensaje,
    url: data.url || null,
    tipo: data.tipo || null,
    leida: false,
  });
  if (error) console.error('[Notificaciones] Error al crear:', error.message);
}

export async function listarNotificaciones(usuarioId: string) {
  const cl = db();
  const { data } = await cl.from('notificaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}

export async function contarNoLeidas(usuarioId: string): Promise<number> {
  const cl = db();
  const { count } = await cl.from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('leida', false);
  return count || 0;
}

export async function marcarLeida(id: number): Promise<void> {
  const cl = db();
  await cl.from('notificaciones').update({ leida: true }).eq('id', id);
}

export async function marcarTodasLeidas(usuarioId: string): Promise<void> {
  const cl = db();
  await cl.from('notificaciones').update({ leida: true }).eq('usuario_id', usuarioId).eq('leida', false);
}

export async function notificarCoordinadoresDocente(
  docenteId: number,
  cuatrimestreId: number,
  titulo: string,
  mensaje: string,
  url?: string
): Promise<void> {
  const cl = dbAdmin();
  const { data: vinculaciones } = await cl.from('coordinated_teacher_assignments')
    .select('coordinador_id')
    .eq('docente_id', docenteId)
    .eq('cuatrimestre_id', cuatrimestreId)
    .is('revoked_at', null);
  for (const v of vinculaciones || []) {
    await crearNotificacion({ usuario_id: v.coordinador_id, titulo, mensaje, url, tipo: 'planeacion' });
  }
}

export async function notificarDocente(
  docenteId: number,
  titulo: string,
  mensaje: string,
  url?: string
): Promise<void> {
  const cl = db();
  const { data: docente } = await cl.from('docentes').select('email').eq('id', docenteId).maybeSingle();
  if (!docente?.email) return;
  const { data: usuarios } = await cl.from('usuarios').select('id').eq('email', docente.email).eq('rol', 'docente');
  if (!usuarios?.length) return;
  for (const u of usuarios) {
    await crearNotificacion({ usuario_id: u.id, titulo, mensaje, url, tipo: 'planeacion' });
  }
}
