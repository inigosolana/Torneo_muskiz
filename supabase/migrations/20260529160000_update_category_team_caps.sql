-- Límites de equipos inscritos por categoría (plazas de torneo)
UPDATE public.categories SET max_teams = 8 WHERE name = 'Cadete Femenino';
UPDATE public.categories SET max_teams = 8 WHERE name = 'Cadete Masculino';
UPDATE public.categories SET max_teams = 9 WHERE name = 'Juvenil Masculino';

-- Mantener alineado el JSON de site_content usado en /schedule
UPDATE public.site_content
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'Cadete Femenino', 8,
  'Cadete Masculino', 8,
  'Juvenil Masculino', 9
)
WHERE key = 'category_limits';
