-- A small permanent name -> email directory, kept separate from
-- device_assignments on purpose. Import sources (Grover, Amazon, MDM
-- exports) frequently know a device's current owner by name but not
-- email; rather than patching user_email onto assignment rows after the
-- fact (which has to be redone every time a device gets re-imported,
-- reassigned, or recreated), the app resolves a missing email by looking
-- up the assignee's name here at display time. device_assignments itself
-- is never written to for this -- it stays a pure, untouched log.
--
-- Maintained the same way as allowed_users: no insert/update policy, kept
-- SQL-editor/superuser managed. Populate/refresh it by re-running the
-- Grover employee directory scraper and pasting its generated SQL.

create type employment_type as enum ('employee', 'freelancer');

create table employees (
  user_name text primary key,
  user_email text not null,
  employment_type employment_type,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table employees enable row level security;

create policy "allowed users can read employees" on employees
  for select
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

grant select on employees to authenticated;
