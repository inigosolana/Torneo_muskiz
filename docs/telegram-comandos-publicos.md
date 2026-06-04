# Bot de Telegram — comandos públicos (aficionados)

El bot de **equipos/inscripciones** (`TELEGRAM_NOTIFICATIONS_BOT_TOKEN`) responde a cualquier usuario con datos del calendario **publicado** (`is_public` + interruptor en `site_content.schedule_visibility`).

## Comandos

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/help` | `/help` | Lista de comandos públicos |
| `/resultados` | `/resultados senior` | Últimos resultados de la categoría |
| `/clasificacion` | `/clasificacion juvenil` | Clasificación por grupos |
| `/siguiente` / `/proximo` | `/siguiente partido Kolosaurios` | Próximo partido del equipo |

### Categorías (alias)

- `senior masculino`, `sm` → Senior Masculino  
- `senior femenino`, `sf` → Senior Femenino  
- `juvenil`, `jm`, `jf` → Juvenil (masc/fem si indicas)  
- `cadete`, `infantil`, códigos `cm`, `cf`, `im`, `if`…

Solo `senior` sin más → resultados/clasificación de **Senior Masc + Senior Fem**.

## Despliegue

Tras cambiar el código:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
.\deploy-edge-functions.ps1
```

O solo:

```bash
npx supabase functions deploy telegram-fan-query --project-ref jwixdjmbwfnfwmtsmsau --no-verify-jwt
npx supabase functions deploy telegram-bot-webhook --project-ref jwixdjmbwfnfwmtsmsau --no-verify-jwt
npx supabase functions deploy telegram-admin-query --project-ref jwixdjmbwfnfwmtsmsau --no-verify-jwt
```

Los comandos de staff (`/equipo`, `/inscripciones`…) siguen limitados a `TELEGRAM_ADMIN_CHAT_IDS` y `TELEGRAM_VIEWER_CHAT_IDS`.
