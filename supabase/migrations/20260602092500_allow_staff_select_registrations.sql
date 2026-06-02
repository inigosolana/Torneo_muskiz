create policy "Allow staff to view registrations"
on public.registrations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'staff'
  )
);
