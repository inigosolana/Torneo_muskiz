# Despliega las Edge Functions del Torneo Muskiz al proyecto Supabase remoto.
# Requisito: token de acceso personal de Supabase (no el anon key).
#   Dashboard: https://supabase.com/dashboard/account/tokens
#   PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#
# Uso (desde esta carpeta Torneo_muskiz):
#   .\deploy-edge-functions.ps1

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error "Falta SUPABASE_ACCESS_TOKEN. Crear token en Supabase Dashboard > Account > Access Tokens y exportarlo en esta sesión."
}

$ProjectRef = "jwixdjmbwfnfwmtsmsau"
Set-Location $PSScriptRoot

Write-Host "Desplegando Edge Functions a proyecto $ProjectRef ..."

# handle-rejection: dejar verificación JWT activa (coincide con el proyecto actual).
npx --yes supabase@latest functions deploy handle-rejection --project-ref $ProjectRef

# Resto: webhooks y acciones internas llamadas con service role / sin JWT de usuario.
$noJwt = @(
  "handle-approval",
  "webhook-registration",
  "telegram-bot-webhook",
  "admin-review-action"
)
foreach ($name in $noJwt) {
  npx --yes supabase@latest functions deploy $name --project-ref $ProjectRef --no-verify-jwt
}

Write-Host "Listo. Revisa en Dashboard > Edge Functions que la versión haya subido."
