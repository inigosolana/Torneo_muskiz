-- Si ya aplicaste set_scores sin goals_for_*, ejecuta solo este archivo.
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS goals_for_a integer,
ADD COLUMN IF NOT EXISTS goals_for_b integer;

COMMENT ON COLUMN public.matches.goals_for_a IS 'Goles totales equipo A (suma sets + shootout). Para clasificación GF/GC.';
COMMENT ON COLUMN public.matches.goals_for_b IS 'Goles totales equipo B (suma sets + shootout). Para clasificación GF/GC.';
