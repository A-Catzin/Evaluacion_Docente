// Helper para páginas Astro: verifica sesión (real o test)
export function verificarSesion(Astro: { cookies: { get: (name: string) => { value: string } | undefined }; redirect: (path: string) => Response }) {
  const testUser = Astro.cookies.get('test-user')?.value;
  if (testUser) {
    try { const u = JSON.parse(testUser); if (u.id && u.rol) return u; } catch {}
  }
  const t = Astro.cookies.get('sb-access-token')?.value;
  if (!t) return null;
  return { real: true };
}
