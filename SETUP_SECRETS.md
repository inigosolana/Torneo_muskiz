# Secrets de Edge Functions (Supabase)

Las claves **no deben guardarse en el repositorio**. Configúralas solo en el servidor de Supabase o en tu entorno local.

## Supabase CLI

```bash
supabase secrets set GEMINI_API_KEY="tu_clave"
supabase secrets set RESEND_API_KEY="tu_clave"
```

## Dashboard

1. Abre tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard).
2. Ve a **Project Settings → Edge Functions** (o **Secrets**).
3. Añade cada variable con el valor de tu proveedor.

## Dónde obtener cada clave

| Variable | Origen |
|----------|--------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `RESEND_API_KEY` | [Resend](https://resend.com/api-keys) → API Keys |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase → **Project Settings → API** (solo en `.env` local, ver `.env.example`) |

## Frontend local

```bash
cp .env.example .env
# Rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
```

`.env` está en `.gitignore` y no debe commitearse nunca.

## Servidor (VPS / Docker)

El archivo debe llamarse **`.env`** (con punto) en la misma carpeta que `docker-compose.yml`.

### Editar viendo lo que escribes

`nano` muestra el texto al escribir (no oculta caracteres):

```bash
cd ~/Torneo_muskiz
cp .env.example .env
nano .env
```

Pega o escribe las líneas, guarda (`Ctrl+O`, Enter) y sal (`Ctrl+X`).

### Ver exactamente lo que guardaste

```bash
cat .env
```

O el script del repo (muestra el archivo entero + comprueba que Docker lo leerá):

```bash
bash scripts/verify-server-env.sh
```

### Si no se ven bien las claves (espacios o saltos raros)

```bash
cat -A .env
```

No debe haber `^M` al final de las líneas. Cada variable en una sola línea, sin comillas rotas:

```env
VITE_SUPABASE_URL=https://jwixdjmbwfnfwmtsmsau.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
```

### Build con esas variables

```bash
docker compose build --no-cache app
docker compose up -d app
```
