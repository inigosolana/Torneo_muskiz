-- Visibilidad por partido: la web pública sólo muestra filas con is_public = true.
-- Ejecutar en Supabase SQL editor o vía migración CLI.

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.matches.is_public IS 'Si es false, el partido no aparece en Competición (visitantes) hasta que staff lo publique.';
