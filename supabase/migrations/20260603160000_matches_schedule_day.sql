-- Día del fin de semana para agrupar la cuadrícula pública (Viernes / Sábado / Domingo).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS schedule_day text;

COMMENT ON COLUMN public.matches.schedule_day IS 'Viernes, Sábado o Domingo — cuadrícula oficial y web pública.';
