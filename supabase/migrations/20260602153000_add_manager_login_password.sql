-- Contraseña elegida en inscripción: solo para recordatorios por correo (edge functions con service role).
alter table public.registrations
add column if not exists manager_login_password text;

comment on column public.registrations.manager_login_password is
  'Contraseña del panel de responsables indicada al inscribirse; no exponer en API pública.';

drop function if exists public.create_registration_with_teams(text, text, text, jsonb);
drop function if exists public.create_registration_with_teams(text, text, text, jsonb, uuid);

create or replace function public.create_registration_with_teams(
  p_manager_name text,
  p_manager_email text,
  p_manager_phone text,
  p_teams jsonb,
  p_auth_user_id uuid default null,
  p_manager_login_password text default null
)
returns setof public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
  v_email text := lower(trim(coalesce(p_manager_email, '')));
  v_password text := nullif(trim(coalesce(p_manager_login_password, '')), '');
begin
  if p_teams is null or jsonb_array_length(p_teams) = 0 then
    raise exception 'At least one team is required';
  end if;

  insert into public.registrations (manager_name, manager_email, manager_phone, auth_user_id, manager_login_password)
  values (p_manager_name, p_manager_email, p_manager_phone, p_auth_user_id, v_password)
  returning id into v_registration_id;

  if v_password is not null and v_email <> '' then
    update public.registrations
    set manager_login_password = v_password
    where lower(trim(manager_email)) = v_email;
  end if;

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
      manager_phone,
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
      p_manager_phone,
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

revoke all on function public.create_registration_with_teams(text, text, text, jsonb, uuid, text) from public;
grant execute on function public.create_registration_with_teams(text, text, text, jsonb, uuid, text) to anon, authenticated, service_role;
