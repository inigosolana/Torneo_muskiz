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
