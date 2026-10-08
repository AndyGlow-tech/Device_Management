-- Bulk import (Excel/JSON upload) is a sync, not a one-time bulk-create:
-- devices are upserted by serial_number, and a new assignment is only
-- inserted when the row's owner differs from the device's current open
-- assignment -- re-importing the same file is a no-op for unchanged
-- owners, while a changed owner becomes real history via the existing
-- close_previous_assignment trigger, exactly like a manual reassign.
--
-- SECURITY INVOKER (the default -- not specified here) so RLS on
-- `devices` and `device_assignments` still applies to the caller; only an
-- allowed user can run this successfully, same as any other write.

create or replace function public.import_devices(rows jsonb)
returns void
language plpgsql
as $$
declare
  row_data record;
  target_device_id uuid;
  current_owner_name text;
  current_owner_email text;
begin
  for row_data in
    select *
    from jsonb_to_recordset(rows) as x(
      serial_number text,
      device_name text,
      origin device_origin,
      order_date date,
      enrollment_status enrollment_status,
      enrolled_at date,
      owner_name text,
      owner_email text,
      assigned_at date
    )
  loop
    select id into target_device_id from devices where serial_number = row_data.serial_number;

    if target_device_id is null then
      insert into devices (serial_number, device_name, origin, order_date, enrollment_status, enrolled_at)
      values (
        row_data.serial_number,
        row_data.device_name,
        row_data.origin,
        row_data.order_date,
        coalesce(row_data.enrollment_status, 'not_enrolled'),
        row_data.enrolled_at
      )
      returning id into target_device_id;
    else
      update devices set
        device_name = row_data.device_name,
        origin = coalesce(row_data.origin, origin),
        order_date = coalesce(row_data.order_date, order_date),
        enrollment_status = coalesce(row_data.enrollment_status, enrollment_status),
        enrolled_at = coalesce(row_data.enrolled_at, enrolled_at)
      where id = target_device_id;
    end if;

    if row_data.owner_name is not null or row_data.owner_email is not null then
      select user_name, user_email into current_owner_name, current_owner_email
      from device_assignments
      where device_id = target_device_id and unassigned_at is null;

      if current_owner_name is distinct from row_data.owner_name
        or current_owner_email is distinct from row_data.owner_email then
        insert into device_assignments (device_id, user_name, user_email, assigned_at, changed_by)
        values (
          target_device_id,
          row_data.owner_name,
          row_data.owner_email,
          coalesce(row_data.assigned_at, current_date),
          (auth.jwt() ->> 'email')
        );
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.import_devices(jsonb) to authenticated;
revoke execute on function public.import_devices(jsonb) from anon, public;
