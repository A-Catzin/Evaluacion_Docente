import type { APIRoute } from 'astro';
import { crearClienteConSesion } from '../../../lib/supabaseClient';
import { obtenerDestinoInicio, resolverRolAutenticado } from '../../../lib/roles';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errorContext(error: unknown) {
  if (!error || typeof error !== 'object') return { type: typeof error };

  const value = error as Record<string, unknown>;
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return json({ error: 'Sesión no válida', code: 'session_invalid' }, 401);
  }

  try {
    const client = crearClienteConSesion(accessToken);
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) {
      console.warn('[auth/rol] invalid session token', { error: errorContext(error) });
      return json({ error: 'Sesión no válida', code: 'session_invalid' }, 401);
    }

    try {
      const rol = await resolverRolAutenticado(client);
      return json({ rol, destino: obtenerDestinoInicio(rol) }, 200);
    } catch (error) {
      console.error('[auth/rol] role resolution failed', {
        userId: data.user.id,
        error: errorContext(error),
      });
      return json({ error: 'No se pudo verificar el acceso', code: 'role_resolution_failed' }, 502);
    }
  } catch (error) {
    console.error('[auth/rol] session validation failed', { error: errorContext(error) });
    return json({ error: 'No se pudo verificar el acceso', code: 'role_resolution_failed' }, 502);
  }
};
