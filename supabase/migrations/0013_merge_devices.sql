-- Supports the manual duplicate-review flow: when the same physical
-- device exists as two rows (typically an unreconciled Amazon row with no
-- serial, and a later Deeploi/MDM row with the real serial), a human
-- confirms the merge -- never automatic. keep_id survives; duplicate_id's
-- assignment history is moved onto it, any fields keep_id doesn't already
-- have are filled in from duplicate_id, then duplicate_id is deleted.
--
-- SECURITY INVOKER (the default) so RLS still applies -- this is the
-- app's first DELETE, so it needs an actual delete policy on devices,
-- added below (allowed users only, same check as every other policy).

create policy "allowed users can delete devices" on devices
  for delete
  to authenticated
  using (exists (select 1 from allowed_users where email = (auth.jwt() ->> 'email')));

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

  -- Both sides likely had their own currently-open assignment row before
  -- the merge; moving duplicate_id's rows onto keep_id can leave more than
  -- one "open" (unassigned_at is null) row for the same device, breaking
  -- the "at most one open assignment per device" invariant the rest of the
  -- app relies on. Close every open row except the most recently assigned
  -- one, exactly like the normal reassignment trigger would.
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
      serial_number = coalesce(k.serial_number, d.serial_number)
  from devices d
  where k.id = keep_id and d.id = duplicate_id;

  delete from devices where id = duplicate_id;
end;
$$;

grant execute on function public.merge_devices(uuid, uuid) to authenticated;
revoke execute on function public.merge_devices(uuid, uuid) from anon, public;
