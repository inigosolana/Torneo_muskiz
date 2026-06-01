# Responsable de prueba sin equipo

Correo: `inigosolanaa@gmail.com`

En el servidor (con `SUPABASE_SERVICE_ROLE_KEY` del dashboard Supabase):

```powershell
cd ~/Torneo_muskiz
$env:SUPABASE_SERVICE_ROLE_KEY = "TU_SERVICE_ROLE_KEY"
$env:MANAGER_TEST_EMAIL = "inigosolanaa@gmail.com"
$env:MANAGER_TEST_PASSWORD = "MuskizManager2026!"
npx --yes tsx scratch/create_manager_no_team.ts
```

Contraseña por defecto si no defines `MANAGER_TEST_PASSWORD`: `MuskizManager2026!`

Login: https://torneomuskizbmplaya.es/manager-login
