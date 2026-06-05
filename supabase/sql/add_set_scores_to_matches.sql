-- Ejecutar en Supabase SQL Editor si la migración no se ha aplicado aún.
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS set_scores jsonb;

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS goals_for_a integer,
ADD COLUMN IF NOT EXISTS goals_for_b integer;

COMMENT ON COLUMN public.matches.set_scores IS
  'JSON: set1A, set1B, set2A, set2B, shootoutA, shootoutB — goles por set para clasificación.';

COMMENT ON COLUMN public.matches.goals_for_a IS 'Goles totales equipo A (suma sets + shootout).';
COMMENT ON COLUMN public.matches.goals_for_b IS 'Goles totales equipo B (suma sets + shootout).';
