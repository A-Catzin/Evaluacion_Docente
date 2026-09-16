import { crearClienteSuperbase, obtenerClienteAdmin } from "./supabaseClient";
import type { RolUsuario } from "../types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

let _cachedDbAdmin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  return crearClienteSuperbase();
}

export function dbAdmin(): SupabaseClient {
  if (!_cachedDbAdmin) _cachedDbAdmin = obtenerClienteAdmin();
  return _cachedDbAdmin;
}

export async function obtenerRolUsuario(
  userId: string,
  cliente: SupabaseClient = db(),
): Promise<RolUsuario | null> {
  const { data: usuario, error } = await cliente
    .from("usuarios")
    .select("rol")
    .eq("id", userId)
    .maybeSingle();

  // Propagate returned Supabase failures so callers can distinguish an
  // unavailable upstream from an authenticated user without an allowed role.
  if (error) throw error;
  return (usuario?.rol as RolUsuario) ?? null;
}
