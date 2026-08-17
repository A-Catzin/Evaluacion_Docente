import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocketPolyfill from 'ws';

// Polyfill para Node < 22
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as Record<string, unknown>).WebSocket = WebSocketPolyfill;
}

let _cliente: SupabaseClient | null = null;
let _clienteAdmin: SupabaseClient | null = null;

function obtenerVariablesEntorno() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const clave = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !clave) throw new Error('Faltan PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY');
  return { url, clave };
}

export function obtenerClienteSuperbase(): SupabaseClient {
  if (!_cliente) {
    _cliente = crearClienteSuperbase();
  }
  return _cliente;
}

export function crearClienteSuperbase(): SupabaseClient {
  const { url, clave } = obtenerVariablesEntorno();
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function obtenerClienteAdmin(): SupabaseClient {
  if (!_clienteAdmin) {
    const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
    const clave = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
    if (!url || !clave) throw new Error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    _clienteAdmin = createClient(url, clave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _clienteAdmin;
}

export function crearClienteConSesion(tokenAcceso: string): SupabaseClient {
  const { url, clave } = obtenerVariablesEntorno();
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenAcceso}` } },
  });
}
