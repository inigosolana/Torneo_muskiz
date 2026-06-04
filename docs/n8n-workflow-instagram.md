# Workflow n8n — Generador Instagram Torneo Muskiz

## 1. Webhook de entrada

- Nodo: **Webhook** (POST), path sugerido: `torneo-instagram`
- Copia la URL de producción → `N8N_SOCIAL_WH_URL` en Supabase secrets.

El cuerpo es el JSON del torneo (`eventType: torneo-social-content`).

## 2. Ramas por plantilla

Usa un nodo **Switch** sobre `{{ $json.template }}`:

| Rama | Acción |
|------|--------|
| `standings_group_story` | Render Stitch/HTML → story clasificación |
| `standings_group_feed` | Mismo diseño 1:1 para feed |
| `results_day_story` | Lista de resultados del día |
| `match_result_feed` / `match_result_story` | Post de un partido |
| `live_digest` | Solo log / notificación interna |

## 3. Generar imagen

Opciones (elige una):

**A) Stitch (MCP o API)**  
- Input: `stitch` + `format` + `brand`  
- Output: URL PNG

**B) HTML → imagen**  
- HTTP Request a plantilla local o `torneomuskizbmplaya.es/social-templates/...`  
- Nodo **HTML/CSS to Image** o servicio externo (Bannerbear, etc.)

## 4. Texto Instagram

- Usar `captionDraft` tal cual, o  
- HTTP Request a `generate-social-post` con el payload para pulir con Gemini.

## 5. Publicar (opcional)

- **Instagram Graph API** (cuenta Business): nodo HTTP con `image_url` + `caption`.  
- O enviar a **Telegram/Email** como borrador para revisión humana (recomendado la primera vez).

## 6. Automatización día de torneo

**Cron** (sábado 9:00–21:00, cada 45 min):

```json
POST .../trigger-n8n-social
{"mode":"day_results","scheduleDay":"Sábado"}
```

**Tras cada jornada de grupos** (domingo tarde):

```json
{"mode":"all_groups"}
```

## 7. Importar workflow base

En n8n: **Workflows → Import from File** → `docs/n8n/torneo-instagram-webhook.json`

Ajusta credenciales de Instagram y la URL del webhook tras importar.

## Panel Admin

**Admin → Instagram / n8n**: genera JSON, mejora caption con Gemini, envía a n8n con un clic.
