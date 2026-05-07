-- Reset only registration-related data (safe for tournament config content).
-- Run in Supabase SQL Editor for project: jwixdjmbwfnfwmtsmsau

begin;

-- Remove dependent rows first
delete from public.players;
delete from public.teams;
delete from public.registrations;
delete from public.matches;

commit;

-- Optional: also remove manager app profiles (keeps staff profiles)
-- delete from public.profiles where role = 'manager';

-- Optional: remove manager auth users too (execute only if you really want clean auth)
-- delete from auth.users
-- where id in (
--   select id from public.profiles where role = 'manager'
-- );
