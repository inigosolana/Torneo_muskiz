ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS min_matches_per_team integer NOT NULL DEFAULT 3
CHECK (min_matches_per_team >= 1 AND min_matches_per_team <= 20);

COMMENT ON COLUMN public.categories.min_matches_per_team IS 'Mínimo de partidos reales por equipo en el simulador de calendario para esta categoría';
