#!/usr/bin/env bash
# Muestra el .env del servidor tal como está guardado (para comprobar lo que escribiste).
# Uso en el VPS:  cd ~/Torneo_muskiz && bash scripts/verify-server-env.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

cd "$ROOT"

echo "=============================================="
echo " Archivo: $ENV_FILE"
echo "=============================================="

if [[ ! -f "$ENV_FILE" ]]; then
    echo "No existe .env — créalo:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

echo ""
echo "--- Contenido completo (lo que hay en disco) ---"
cat "$ENV_FILE"
echo ""
echo "--- Fin del archivo ---"
echo ""

# Cargar variables para comprobar que Docker las verá
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mask() {
    local v="$1"
    local n=${#v}
    if [[ $n -le 12 ]]; then
        echo "(vacío o demasiado corto)"
        return
    fi
    echo "${v:0:16}...${v: -8} (${n} caracteres)"
}

echo "=== Valores que usará docker compose build ==="
if [[ -n "${VITE_SUPABASE_URL:-}" ]]; then
    echo "VITE_SUPABASE_URL      = $VITE_SUPABASE_URL"
else
    echo "VITE_SUPABASE_URL      = (VACÍO — rellénalo en .env)"
fi

if [[ -n "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
    echo "VITE_SUPABASE_ANON_KEY = $(mask "$VITE_SUPABASE_ANON_KEY")"
else
    echo "VITE_SUPABASE_ANON_KEY = (VACÍO — rellénalo en .env)"
fi

echo ""
if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
    echo "ERROR: Faltan variables. Edita con:  nano .env"
    echo "Tras guardar, vuelve a ejecutar este script y luego:"
    echo "  docker compose build --no-cache app && docker compose up -d app"
    exit 1
fi

echo "OK: Variables presentes. Reconstruye si cambiaste algo:"
echo "  docker compose build --no-cache app && docker compose up -d app"
