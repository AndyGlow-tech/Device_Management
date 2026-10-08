-- Asana tasks linked to a device, plus a free-text note on each
-- assignment so the custody log can explain *why* a device moved.
-- asana_tasks is jsonb rather than a child table: the list is small,
-- edited as a unit, and never queried independently of the device.

alter table devices
  add column asana_tasks jsonb not null default '[]'::jsonb;

alter table devices
  add constraint asana_tasks_is_array
  check (jsonb_typeof(asana_tasks) = 'array');

alter table device_assignments
  add column description text;

create or replace function public.merge_devices(keep_id uuid, duplicate_id uuid)
returns void
language plpgsql
as $$
declare
  newest_open_id uuid;
  newest_open_assigned_at date;
begin
  if keep_id = duplicate_id then
    raise exception 'Cannot merge a device with itself.';
  end if;

  update device_assignments set device_id = keep_id where device_id = duplicate_id;

  select id, assigned_at into newest_open_id, newest_open_assigned_at
  from device_assignments
  where device_id = keep_id and unassigned_at is null
  order by assigned_at desc, created_at desc
  limit 1;

  if newest_open_id is not null then
    update device_assignments
    set unassigned_at = newest_open_assigned_at
    where device_id = keep_id
      and unassigned_at is null
      and id <> newest_open_id;
  end if;

  update devices as k
  set origin = coalesce(k.origin, d.origin),
      order_date = coalesce(k.order_date, d.order_date),
      ownership_status = coalesce(k.ownership_status, d.ownership_status),
      monthly_price = coalesce(k.monthly_price, d.monthly_price),
      purchase_price = coalesce(k.purchase_price, d.purchase_price),
      amazon_order_number = coalesce(k.amazon_order_number, d.amazon_order_number),
      grover_contract_number = coalesce(k.grover_contract_number, d.grover_contract_number),
      serial_number = coalesce(k.serial_number, d.serial_number),
      asana_tasks = coalesce(k.asana_tasks, '[]'::jsonb) || coalesce(d.asana_tasks, '[]'::jsonb)
  from devices d
  where k.id = keep_id and d.id = duplicate_id;

  delete from devices where id = duplicate_id;
end;
$$;
