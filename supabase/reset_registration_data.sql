-- Reset de pruebas: NO borra sponsors, categories, site_content ni staff.
-- Run in Supabase SQL Editor for project: jwixdjmbwfnfwmtsmsau

begin;

delete from public.player_stats;
delete from public.telegram_pending_rejections;
delete from public.matches;
delete from public.players;
delete from public.teams;
delete from public.registrations;
delete from public.gallery;
delete from public.profiles where role = 'manager';

commit;
