import type { SupabaseClient } from '@supabase/supabase-js';
import type { RolUsuario } from '../types/supabase';

const ROLES_USUARIO: RolUsuario[] = [
  'superadmin',
  'coordinador',
  'docente',
  'estudiante',
  'observador',
  'pendiente',
];

export function esRolUsuario(rol: unknown): rol is RolUsuario {
  return typeof rol === 'string' && ROLES_USUARIO.includes(rol as RolUsuario);
}

export function obtenerDestinoInicio(rol: string | null | undefined): string {
  switch (rol) {
    case 'superadmin':
      return '/admin/dashboard';
    case 'coordinador':
      return '/coordinador/dashboard';
    case 'docente':
      return '/docente/dashboard';
    case 'estudiante':
      return '/estudiante/dashboard';
    case 'observador':
      return '/observador/dashboard';
    default:
      return '/pendiente';
  }
}

export async function resolverRolAutenticado(cliente: SupabaseClient): Promise<RolUsuario> {
  const { data, error } = await cliente.rpc('resolver_rol_autenticado');
  if (error) throw error;

  if (!esRolUsuario(data)) {
    throw new Error('El resolvedor de roles devolvió un valor no válido');
  }

  return data;
}
