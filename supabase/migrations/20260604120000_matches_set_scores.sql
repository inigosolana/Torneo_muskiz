-- Tanteo por set (goles de cada set + shootout) para clasificación GF/GC.
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS set_scores jsonb;

COMMENT ON COLUMN public.matches.set_scores IS
  'JSON: set1A, set1B, set2A, set2B, shootoutA, shootoutB — goles por set para clasificación.';
