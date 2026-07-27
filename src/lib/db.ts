import { obtenerClienteSuperbase, obtenerClienteAdmin } from './supabaseClient';
import type { RolUsuario } from '../types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

let _cachedDb: SupabaseClient | null = null;
let _cachedDbAdmin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!_cachedDb) _cachedDb = obtenerClienteSuperbase();
  return _cachedDb;
}

export function dbAdmin(): SupabaseClient {
  if (!_cachedDbAdmin) _cachedDbAdmin = obtenerClienteAdmin();
  return _cachedDbAdmin;
}

export async function obtenerRolUsuario(userId: string): Promise<RolUsuario | null> {
  const cliente = db();
  const { data: usuario } = await cliente
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .maybeSingle();

  return (usuario?.rol as RolUsuario) ?? null;
}
