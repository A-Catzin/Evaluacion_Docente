/**
 * Servicio de Usuarios — Gestión de roles y perfiles
 */
import { db } from '../lib/db';
import type { Usuario, RolUsuario } from '../types/supabase';

export interface UsuarioConNombre extends Usuario {
  nombre_completo: string;
  matricula_o_empleado: string;
}

export async function obtenerUsuarios(rol?: RolUsuario): Promise<UsuarioConNombre[]> {
  let query = db().from('usuarios').select('*');

  if (rol) query = query.eq('rol', rol);

  const { data: usuarios, error } = await query.order('email');

  if (error) throw new Error('Error al obtener usuarios');

  // Enriquecer con nombres desde docentes/estudiantes
  const resultado: UsuarioConNombre[] = [];

  for (const u of (usuarios || [])) {
    let nombre = u.email.split('@')[0].replace(/[._]/g, ' ');
    let matricula = '—';

    if (u.entidad_id) {
      if (u.rol === 'docente') {
        const { data: doc } = await db().from('docentes').select('nombre,apellidos,num_empleado').eq('id', u.entidad_id).maybeSingle();
        if (doc) {
          nombre = `${doc.nombre} ${doc.apellidos}`;
          matricula = doc.num_empleado || '—';
        }
      }
    }

    resultado.push({ ...u as Usuario, nombre_completo: nombre, matricula_o_empleado: matricula });
  }

  return resultado;
}

export async function cambiarRolUsuario(userId: string, nuevoRol: RolUsuario): Promise<void> {
  const { error } = await db().from('usuarios').update({ rol: nuevoRol }).eq('id', userId);
  if (error) throw new Error('Error al cambiar rol');
}

export async function buscarUsuarios(termino: string): Promise<UsuarioConNombre[]> {
  const todos = await obtenerUsuarios();
  const t = termino.toLowerCase();
  return todos.filter(u =>
    u.nombre_completo.toLowerCase().includes(t) ||
    u.email.toLowerCase().includes(t) ||
    u.matricula_o_empleado.toLowerCase().includes(t)
  );
}
