import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase — Carga perezosa (Lazy Initialization)
 *
 * No se inicializa en el top-level para evitar errores durante el build
 * cuando las variables de entorno no están disponibles.
 */

let _cliente: SupabaseClient | null = null;

function obtenerVariablesEntorno() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const clave = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !clave) {
    throw new Error(
      'Faltan variables de entorno: PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY'
    );
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
