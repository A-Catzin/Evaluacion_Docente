import { obtenerClienteSuperbase } from './supabaseClient';

/**
 * Obtiene el usuario autenticado (real o test)
 * Retorna { id, email, rol } o null si no hay sesión válida
 */
export async function obtenerUsuarioAutenticado(cookies: { get: (name: string) => { value: string } | undefined }) {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  if (!tokenAcceso) return null;

  // Test token
  if (tokenAcceso.startsWith('test_token_')) {
    try {
      const payload = JSON.parse(atob(tokenAcceso.replace('test_token_', '')));
      if (payload.test && payload.sub) return { id: payload.sub, email: payload.email, rol: payload.rol };
    } catch { return null; }
  }

  // Token real de Supabase
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;
  if (!tokenRefresco) return null;
  try {
    const cliente = obtenerClienteSuperbase();
    const { data } = await cliente.auth.setSession({ access_token: tokenAcceso, refresh_token: tokenRefresco });
    if (!data.user) return null;
    const { data: usuario } = await cliente.from('usuarios').select('rol').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, email: data.user.email!, rol: usuario?.rol || 'estudiante' };
  } catch { return null; }
}
