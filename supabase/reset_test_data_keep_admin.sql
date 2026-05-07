-- Limpia datos de prueba y deja intacto lo de administración / configuración del torneo.
-- Ejecutar en Supabase → SQL Editor (proyecto jwixdjmbwfnfwmtsmsau).
--
-- BORRA:
--   players, teams, registrations, matches
--   telegram_pending_rejections (motivos de denegación pendientes en Telegram)
--   profiles con role = 'manager' (responsables de equipo de prueba)
--
-- NO TOCA (admin / sitio):
--   profiles con role = 'staff' (tu panel admin)
--   categories, sponsors, site_content
--   auth.users (los usuarios siguen existiendo; solo se quita la fila en profiles si era manager)
--
-- Storage (justificantes, DNI, logos): NO se borra aquí. Si quieres vaciar buckets,
-- hazlo en Storage del dashboard o con la CLI.

begin;

delete from public.telegram_pending_rejections;
delete from public.players;
delete from public.teams;
delete from public.registrations;
delete from public.matches;
delete from public.profiles where role = 'manager';

commit;
