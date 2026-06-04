# Bot Telegram — revisión publicaciones Instagram

Borrador separado del bot de equipos/inscripciones. Recibe clasificaciones, resultados y posts generados desde Admin o n8n.

## Configuración (una vez)

1. Secrets en Supabase:

```bash
supabase secrets set TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN="TOKEN_DEL_BOT" --project-ref jwixdjmbwfnfwmtsmsau
# Opcional si ya sabes tu chat:
supabase secrets set TELEGRAM_SOCIAL_REVIEW_CHAT_IDS="TU_CHAT_ID" --project-ref jwixdjmbwfnfwmtsmsau
```

2. Desplegar funciones y registrar webhook:

```powershell
.\deploy-edge-functions.ps1
```

Luego (con service role o `CONFIGURE_TG_WEBHOOK_SECRET`):

```http
POST .../functions/v1/configure-telegram-webhooks
```

O en Telegram API: `setWebhook` →  
`https://jwixdjmbwfnfwmtsmsau.supabase.co/functions/v1/telegram-social-review-webhook`

3. Abre el bot en Telegram y envía **`/start`**. Guarda tu `chat_id` (el bot te lo muestra). Sin esto no hay destino hasta que configures `TELEGRAM_SOCIAL_REVIEW_CHAT_IDS`.

## Pedir publicaciones desde el bot

Escribe al bot (dimensiones automáticas):

| Comando | Formato por defecto |
|---------|---------------------|
| `/grupos senior` | Story 1080×1920 — fase de grupos de la categoría |
| `/grupos juvenil feed` | Feed 1080×1080 |
| `/clasificacion senior grupo A` | Clasificación de un grupo |
| `/equipo Kolosaurios` | Próximo partido + plantilla + ciudades/base |
| `/viene Bitxipare feed` | Igual, en cuadrado 1:1 |
| `/historia Kolosaurias JF` | Siempre story 9:16 (resumen equipo) |
| `/resultados sabado` | Resultados del día (story) |
| `/partido Thunder` | Último resultado del equipo |

Sufijos: `story`, `feed`, `historia`, `post`, `1080x1080`, `1080x1920`.

`/lista` — categorías y formatos. `/help` — ayuda completa.

## Uso desde Admin

| Acción | Dónde |
|--------|--------|
| Generar y enviar borrador | Admin → Instagram / n8n → **Enviar a Telegram (revisar)** |
| Automático al disparar n8n | `trigger-n8n-social` (salvo `skipTelegram: true`) |
| Solo Telegram, sin n8n | `{ "payload": {...}, "skipN8n": true }` |

## Editar fotos del torneo

1. Envía la **foto** con el texto en el **pie de foto** (leyenda), o
2. Envía la foto y después un mensaje con el texto.
3. Comando `/editar` — instrucciones.
4. Escribe **feed** en el texto para post 1080×1080; sin eso → story 1080×1920.

El bot devuelve la imagen lista para subir a Instagram. Los **vídeos** aún no se procesan (usa una captura en foto).

Tiempo habitual: **5–20 s** según tamaño de la foto.

## Botones en Telegram

- **Aprobar** — marca el borrador como listo para publicar en IG.
- **Pedir cambios** — escribe en un mensaje qué modificar; Gemini reescribe el texto.
- **Regenerar texto** — nueva versión con IA sin indicaciones.

## Seguridad

No subas el token del bot al repositorio. Si se filtró, revócalo en [@BotFather](https://t.me/BotFather) y crea uno nuevo.
