-- Árbitros por partido + acceso del coordinador de árbitros
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS referees text;

COMMENT ON COLUMN public.matches.referees IS 'Árbitro(s) asignados al partido (texto libre).';

-- Perfil: role = 'referee_coordinator' en public.profiles
-- Políticas ejemplo (ajusta si ya tienes RLS más restrictivo):
-- CREATE POLICY matches_referee_select ON public.matches FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'referee_coordinator')));
-- CREATE POLICY matches_referee_update ON public.matches FOR UPDATE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'referee_coordinator'))
--   WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'referee_coordinator'));
