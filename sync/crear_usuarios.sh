#!/bin/bash
# Crear usuarios auth para docentes y estudiantes vía REST API
# Uso: bash crear_usuarios.sh

source .env 2>/dev/null
URL="${PUBLIC_SUPABASE_URL:-https://snavhkdyowjmqojcqmqu.supabase.co}"
KEY="${SUPABASE_SERVICE_ROLE_KEY}"
PASS="TecPlaycar2026!"

if [ -z "$KEY" ]; then
  echo "ERROR: Configurá SUPABASE_SERVICE_ROLE_KEY en .env"
  exit 1
fi

crear_usuario() {
  local email="$1"
  local rol="$2"
  local resp=$(curl -s -w "%{http_code}" -o /tmp/supabase_resp.json \
    -X POST "$URL/auth/v1/admin/users" \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\",\"email_confirm\":true,\"user_metadata\":{\"rol\":\"$rol\"}}")
  
  if [ "$resp" = "201" ]; then
    echo "  ✅ $email"
  elif [ "$resp" = "422" ]; then
    echo "  ⚠️ Ya existe: $email"
  else
    local err=$(cat /tmp/supabase_resp.json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('msg',''))" 2>/dev/null)
    echo "  ❌ $email ($resp) $err"
  fi
}

echo "🔐 Creando usuarios con service_role..."
echo "   URL: $URL"

# 1. Obtener emails de docentes
echo ""
echo "📋 Docentes..."
DOCENTES=$(curl -s "$URL/rest/v1/docentes?select=email" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json; [print(d['email']) for d in json.load(sys.stdin)]" 2>/dev/null)

COUNT=0
for email in $DOCENTES; do
  crear_usuario "$email" "docente"
  COUNT=$((COUNT+1))
done

# 2. Obtener emails de estudiantes
echo ""
echo "📋 Estudiantes..."
ESTUDIANTES=$(curl -s "$URL/rest/v1/estudiantes?select=email" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json; [print(d['email']) for d in json.load(sys.stdin)]" 2>/dev/null)

COUNT=0
for email in $ESTUDIANTES; do
  crear_usuario "$email" "estudiante"
  COUNT=$((COUNT+1))
done

echo ""
echo "✅ Proceso completado."
echo "   Contraseña temporal para todos: $PASS"
