-- Core schema: device identity vs. device custody are separate concerns.
-- `devices` never changes on reassignment; `device_assignments` is an
-- append-only log of who has held a device and when.

create type device_origin as enum ('amazon', 'apple_store', 'grover', 'topi', 'other');
create type enrollment_status as enum ('enrolled', 'not_enrolled', 'pending', 'removed');

create table devices (
  id uuid primary key default gen_random_uuid(),
  serial_number text unique not null,
  device_name text not null,
  origin device_origin,
  order_date date,
  enrolled_at date,
  enrollment_status enrollment_status not null default 'not_enrolled',
  created_at timestamptz not null default now()
);

create table device_assignments (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  user_name text,
  user_email text,
  assigned_at date not null,
  unassigned_at date, -- null = this is the current owner
  changed_by text,     -- who made the change, for audit purposes
  created_at timestamptz not null default now()
);

create index device_assignments_device_id_idx on device_assignments (device_id);
