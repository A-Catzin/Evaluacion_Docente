import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _cliente: SupabaseClient | null = null;

function obtenerVariablesEntorno() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const clave = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !clave) throw new Error('Faltan PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY');
  return { url, clave };
}

export function obtenerClienteSuperbase(): SupabaseClient {
  if (!_cliente) {
    const { url, clave } = obtenerVariablesEntorno();
    _cliente = createClient(url, clave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _cliente;
}

export function crearClienteConSesion(tokenAcceso: string): SupabaseClient {
  const { url, clave } = obtenerVariablesEntorno();
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenAcceso}` } },
  });
}
