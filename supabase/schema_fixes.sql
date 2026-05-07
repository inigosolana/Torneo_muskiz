-- Idempotent production fixes applied from incident debugging.
-- Run with Supabase SQL editor when provisioning a new environment.

-- 1) Ensure payment_status enum supports app states.
alter type public.payment_status add value if not exists 'WAITING_VALIDATION';
alter type public.payment_status add value if not exists 'EXPIRED';

-- 1b) Link registrations to auth user (same responsible, several batches).
alter table public.registrations add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

comment on column public.registrations.auth_user_id is 'auth.users del responsable; varias inscripciones pueden compartir el mismo usuario.';

-- 2) Atomic registration+teams insert to avoid orphan registrations.
drop function if exists public.create_registration_with_teams(text, text, text, jsonb);

create or replace function public.create_registration_with_teams(
  p_manager_name text,
  p_manager_email text,
  p_manager_phone text,
  p_teams jsonb,
  p_auth_user_id uuid default null
)
returns setof public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
begin
  if p_teams is null or jsonb_array_length(p_teams) = 0 then
    raise exception 'At least one team is required';
  end if;

  insert into public.registrations (manager_name, manager_email, manager_phone, auth_user_id)
  values (p_manager_name, p_manager_email, p_manager_phone, p_auth_user_id)
  returning id into v_registration_id;

  return query
  with inserted as (
    insert into public.teams (
      name,
      city,
      division,
      payment_status,
      payment_method,
      fee,
      receipt_url,
      manager_name,
      manager_email,
      registration_id
    )
    select
      t.name,
      t.city,
      t.division,
      t.payment_status,
      t.payment_method,
      t.fee,
      t.receipt_url,
      t.manager_name,
      t.manager_email,
      v_registration_id
    from jsonb_to_recordset(p_teams) as t(
      name text,
      city text,
      division text,
      payment_status payment_status,
      payment_method payment_method,
      fee numeric,
      receipt_url text,
      manager_name text,
      manager_email text
    )
    returning *
  )
  select * from inserted;
end;
$$;

revoke all on function public.create_registration_with_teams(text, text, text, jsonb, uuid) from public;
grant execute on function public.create_registration_with_teams(text, text, text, jsonb, uuid) to anon, authenticated, service_role;

-- 3) Same physical phone → must reuse same manager email (ties to one Auth account).
create or replace function public.registration_emails_for_phone(p_phone text)
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select distinct lower(trim(manager_email))
  from public.registrations
  where length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 9
    and regexp_replace(coalesce(manager_phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

revoke all on function public.registration_emails_for_phone(text) from public;
grant execute on function public.registration_emails_for_phone(text) to anon, authenticated, service_role;

comment on function public.registration_emails_for_phone(text) is 'Inscripción: correos ya usados con ese teléfono (comparación solo dígitos).';
