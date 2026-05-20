import asyncio, os, sys
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL", "https://snavhkdyowjmqojcqmqu.supabase.co")
# ⚠️ Service role key — nunca exponer en frontend
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SERVICE_KEY:
    print("ERROR: Configurá SUPABASE_SERVICE_ROLE_KEY en .env")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_KEY)
PASSWORD = "TecPlayacar2026!"  # Contraseña temporal para todos

async def crear_usuarios_tabla(tabla: str, rol: str):
    """Crea auth.users para todos los registros de una tabla que no tengan usuario aún"""
    print(f"\n📋 Procesando {tabla} como {rol}...")

    # Obtener emails que NO tienen usuario creado
    result = supabase.table(tabla).select("email").execute()
    emails_creados = set()

    for i, row in enumerate(result.data):
        email = row["email"]
        if email in emails_creados:
            continue
        emails_creados.add(email)

        # Verificar si ya existe en auth.users (vía usuarios)
        user_check = supabase.table("usuarios").select("id").eq("email", email).execute()
        if user_check.data:
            continue

        try:
            # Crear usuario en auth.users con Admin API
            auth_response = supabase.auth.admin.create_user({
                "email": email,
                "password": PASSWORD,
                "email_confirm": True,
                "user_metadata": {"rol": rol},
            })
            print(f"  ✅ {i+1}/{len(result.data)}: {email}")
        except Exception as e:
            # Puede tirar error si ya existe (race condition)
            err_msg = str(e)
            if "already" in err_msg.lower() or "duplicate" in err_msg.lower():
                # Actualizar metadatos si ya existe
                print(f"  ⚠️ Ya existe: {email}")
            else:
                print(f"  ❌ Error {email}: {e}")

async def main():
    print("🔐 Creando usuarios con service_role...")
    print(f"   URL: {SUPABASE_URL}")

    # 1. Crear docentes como usuarios auth
    await crear_usuarios_tabla("docentes", "docente")

    # 2. Crear estudiantes como usuarios auth
    await crear_usuarios_tabla("estudiantes", "estudiante")

    print("\n✅ Proceso completado.")
    print(f"   Contraseña temporal para todos: {PASSWORD}")
    print("   Los usuarios pueden iniciar sesión con Google (su email) o con esta contraseña.")

if __name__ == "__main__":
    asyncio.run(main())
