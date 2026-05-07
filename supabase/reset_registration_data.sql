-- Reset registration-related data (keeps staff/admin config).
-- Prefer the fuller script: reset_test_data_keep_admin.sql
-- Run in Supabase SQL Editor for project: jwixdjmbwfnfwmtsmsau

begin;

delete from public.telegram_pending_rejections;
delete from public.players;
delete from public.teams;
delete from public.registrations;
delete from public.matches;
delete from public.profiles where role = 'manager';

commit;

-- Optional: remove manager auth users too (execute only if you really want clean auth)
-- delete from auth.users
-- where id in (
--   select id from public.profiles where role = 'manager'
-- );
