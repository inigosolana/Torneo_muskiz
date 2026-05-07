-- Alias corto: mismo contenido que reset_test_data_keep_admin.sql
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
