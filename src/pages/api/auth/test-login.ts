import type { APIRoute } from 'astro';

const TOKEN_PREFIJO = 'test_token_';

// IDs fijos para usuarios de prueba (no dependen de Supabase)
const TEST_USERS: Record<string, string> = {
  superadmin: '00000000-0000-0000-0000-000000000001',
  coordinador: '00000000-0000-0000-0000-000000000002',
  docente: '00000000-0000-0000-0000-000000000003',
  estudiante: '00000000-0000-0000-0000-000000000004',
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();
  const { rol, email, nombre } = body;
  if (!rol || !email) return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });

  const sub = TEST_USERS[rol] || TEST_USERS.estudiante;
  const tokenData = btoa(JSON.stringify({ sub, email, rol, nombre, test: true }));
  const token = TOKEN_PREFIJO + tokenData;
  const esProd = import.meta.env.PROD;

  cookies.set('sb-access-token', token, { path: '/', httpOnly: true, secure: esProd, sameSite: 'lax', maxAge: 86400 });
  cookies.set('sb-refresh-token', token, { path: '/', httpOnly: true, secure: esProd, sameSite: 'lax', maxAge: 86400 });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
