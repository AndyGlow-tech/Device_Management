-- Layer 1: sign-in restriction. Only emails present in `allowed_users` may
-- ever get a Supabase Auth session in the first place. Managing access day
-- to day means adding/removing a row here -- no redeploy required.

create table allowed_users (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table allowed_users enable row level security;

-- Lets a signed-in user confirm their own membership (used by the RLS
-- policies below, which run this same check as a subquery under the
-- caller's role). Never exposes the full list to anyone.
create policy "users can see their own allowlist row" on allowed_users
  for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- Supabase "Before User Created" auth hooks receive a jsonb event shaped
-- like { "user": { "email": "...", ... }, "metadata": { ... } } and must
-- return '{}'::jsonb to allow the signup or a jsonb error object to deny
-- it. This is a hook, not a table trigger -- it must be wired up manually
-- in the Supabase dashboard (Authentication > Hooks > Before User
-- Created), pointing at this function.
create or replace function public.check_allowed_user(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  signup_email text;
begin
  signup_email := event -> 'user' ->> 'email';

  if signup_email is null or not exists (
    select 1 from allowed_users where email = signup_email
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Access restricted to authorized users',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.check_allowed_user(jsonb) to supabase_auth_admin;
revoke execute on function public.check_allowed_user(jsonb) from authenticated, anon, public;

-- Layer 2: Row Level Security. Even if a session existed some other way,
-- these policies independently re-check the caller's email against
-- `allowed_users` before allowing any read or write. No delete policies --
-- nothing in the application ever deletes a device or an assignment.

alter table devices enable row level security;
alter table device_assignments enable row level security;

create policy "allowed users can read devices" on devices
  for select
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

create policy "allowed users can add devices" on devices
  for insert
  to authenticated
  with check (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

create policy "allowed users can update devices" on devices
  for update
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')))
  with check (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

create policy "allowed users can read assignments" on device_assignments
  for select
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

create policy "allowed users can add assignments" on device_assignments
  for insert
  to authenticated
  with check (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

-- Needed so the close_previous_assignment trigger (which runs as the
-- calling user, not as a privileged role) can close out the prior open
-- assignment when a new one is inserted.
create policy "allowed users can update assignments" on device_assignments
  for update
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')))
  with check (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));
