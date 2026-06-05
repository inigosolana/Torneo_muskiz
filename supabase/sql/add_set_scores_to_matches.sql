-- Ejecutar en Supabase SQL Editor si la migración no se ha aplicado aún.
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS set_scores jsonb;

COMMENT ON COLUMN public.matches.set_scores IS
  'JSON: set1A, set1B, set2A, set2B, shootoutA, shootoutB — goles por set para clasificación.';
