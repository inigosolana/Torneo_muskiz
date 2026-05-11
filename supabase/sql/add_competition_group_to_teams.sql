-- Ejecutar en Supabase SQL Editor (una vez por proyecto).
-- Asigna a cada equipo un grupo dentro de su categoría (ej. A, B, C).

alter table public.teams
  add column if not exists competition_group text;

comment on column public.teams.competition_group is 'Grupo dentro de la categoría (ej. A, B). Usado en clasificación y organización del torneo.';
