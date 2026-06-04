# Plantillas gráficas (Stitch) — Instagram Torneo Muskiz

## Qué recibe Stitch

Cada publicación sale de una Edge Function (`social-content-export` o `trigger-n8n-social`). El JSON incluye un bloque **`stitch`** listo para mapear en tu proyecto Stitch:

| Tipo | `template` | Formato | Campos `stitch` |
|------|------------|---------|-----------------|
| Clasificación grupo | `standings_group_feed` / `standings_group_story` | 1080×1080 o 1080×1920 | `title`, `subtitle`, `rows[]` → `pos`, `team`, `pts`, `pj` |
| Resultados del día | `results_day_story` | 1080×1920 | `title`, `subtitle`, `rows[]` → `line1`, `line2` |
| Partido | `match_result_feed` / `match_result_story` | 1080×1080 o 1080×1920 | `title`, `teamA`, `teamB`, `score`, `meta` |
| Resumen | `live_digest` | — | `groups[]`, `upcoming[]` (sin stitch detallado) |

También vienen `brand` (colores, logo, web, @Instagram), `captionDraft` y `format.width/height`.

## Plantillas HTML de referencia

En el sitio (para previsualizar o exportar con Puppeteer/HTML-to-image en n8n):

- `https://torneomuskizbmplaya.es/social-templates/standings-story.html`
- `https://torneomuskizbmplaya.es/social-templates/match-feed.html`

Sustituye `{{title}}`, `{{subtitle}}`, filas de tabla, etc., con los valores de `payload.stitch`.

## Flujo recomendado con MCP Stitch

1. En **Admin → Instagram / n8n**, genera el JSON (botón «Clasificación grupo», «Resultados del día», etc.).
2. Copia el payload o dispara **n8n** (envía el mismo JSON al webhook).
3. En **Stitch**, crea una plantilla 1080×1920 (story) o 1080×1080 (feed) y enlaza:
   - Texto principal ← `stitch.title`
   - Subtítulo ← `stitch.subtitle`
   - Lista repetible ← `stitch.rows`
   - Logo / colores ← `brand.logoUrl`, `brand.primaryColor`
4. Exporta PNG y publica en Instagram (manual o vía n8n + API Meta).

## Modos automáticos (día de torneo)

- **n8n: todos los grupos** — una story de clasificación por cada grupo de cada categoría.
- **n8n: resultados día** — story con todos los partidos finalizados del día elegido (Viernes / Sábado / Domingo).

Programa en n8n un **Cron** cada 30–60 min el sábado/domingo que llame a Supabase:

```http
POST https://jwixdjmbwfnfwmtsmsau.supabase.co/functions/v1/trigger-n8n-social
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>

{"mode":"day_results","scheduleDay":"Sábado"}
```

O desde el panel Admin sin cron.

## Secrets Supabase

```bash
supabase secrets set GEMINI_API_KEY="..."
supabase secrets set N8N_SOCIAL_WH_URL="https://tu-n8n/webhook/torneo-instagram"
```

Despliegue: `.\deploy-edge-functions.ps1` (incluye `social-content-export`, `generate-social-post`, `trigger-n8n-social`).
