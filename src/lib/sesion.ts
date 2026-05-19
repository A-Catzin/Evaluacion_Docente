import { obtenerClienteSuperbase } from './supabaseClient';

interface SesionUsuario { id: string; email: string; rol: string; entidad_id?: number | null; test: boolean }

export async function obtenerSesion(Astro: { cookies: any; redirect: (p: string) => Response }): Promise<SesionUsuario | null> {
  // 1. Modo test
  const testRaw = Astro.cookies.get('test-user')?.value;
  if (testRaw) {
    try {
      const u = JSON.parse(testRaw);
      if (u.id && u.rol) {
        const cl = obtenerClienteSuperbase();
        const { data: db } = await cl.from('usuarios').select('entidad_id').eq('id', u.id).maybeSingle();
        return { id: u.id, email: u.email, rol: u.rol, entidad_id: db?.entidad_id || null, test: true };
      }
    } catch {}
  }

  // 2. Sesión real Supabase
  const token = Astro.cookies.get('sb-access-token')?.value;
  const refresh = Astro.cookies.get('sb-refresh-token')?.value;
  if (!token || !refresh) return null;

  try {
    const cl = obtenerClienteSuperbase();
    const { data } = await cl.auth.setSession({ access_token: token, refresh_token: refresh });
    if (!data.user) return null;
    const { data: db } = await cl.from('usuarios').select('rol,entidad_id').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, email: data.user.email!, rol: db?.rol || 'estudiante', entidad_id: db?.entidad_id, test: false };
  } catch { return null; }
}
