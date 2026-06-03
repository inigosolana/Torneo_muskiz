-- Intercambio grupos SM (fichas de equipo):
-- Bitxi Pare Bihurri → grupo C | Blue Flow → grupo B
-- Ejecutar en Supabase SQL Editor (requiere permisos staff/service).

UPDATE public.teams SET competition_group = 'C' WHERE id = '510dfdbb-e92a-4655-92a0-9a27e711cf8f';
UPDATE public.teams SET competition_group = 'B' WHERE id = 'b813b5aa-c50e-450b-92f4-a81824cd295f';
