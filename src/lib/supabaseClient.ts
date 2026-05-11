import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Polyfill WebSocket con try/catch para evitar crashes en dev mode.
 * Si ws no está disponible, el cliente funciona sin realtime (solo auth/queries).
 */
try {
  if (typeof globalThis.WebSocket === 'undefined') {
    const { default: ws } = await import('ws');
    (globalThis as Record<string, unknown>).WebSocket = ws;
  }
} catch {
  // Sin WebSocket — sin realtime, pero auth y queries funcionan
}

  return { url, clave };
}

/**
 * Cliente de Supabase para uso en el servidor (API routes, server actions, middleware).
 * Usa la clave anónima para operaciones que respetan RLS.
 */
export function obtenerClienteSuperbase(): SupabaseClient {
  if (!_cliente) {
    const { url, clave } = obtenerVariablesEntorno();
    _cliente = createClient(url, clave, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _cliente;
}

/**
 * Crea un cliente de Supabase con una sesión específica.
 * Útil para operaciones que requieren el contexto del usuario autenticado.
 */
export function crearClienteConSesion(tokenAcceso: string): SupabaseClient {
  const { url, clave } = obtenerVariablesEntorno();
  return createClient(url, clave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${tokenAcceso}`,
      },
    },
  });
}
