-- Nombres en pantalla (incluye placeholders tipo "1º Clasificado", "Gan.Semi IM 1").
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team_a_name text,
  ADD COLUMN IF NOT EXISTS team_b_name text;

COMMENT ON COLUMN public.matches.team_a_name IS 'Etiqueta equipo A para calendario público (equipo real o placeholder).';
COMMENT ON COLUMN public.matches.team_b_name IS 'Etiqueta equipo B para calendario público (equipo real o placeholder).';
