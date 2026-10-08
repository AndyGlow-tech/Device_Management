-- Ownership status (bought outright vs. currently under an active rental)
-- and pricing are a different concern from MDM enrollment_status -- a
-- device can be fully enrolled and still be a Grover rental, or purchased
-- outright and not yet enrolled. Kept as separate nullable columns rather
-- than folded into enrollment_status.
--
-- monthly_price and purchase_price are intentionally two different
-- columns, not one generic "price": a Grover rental's recurring monthly
-- cost and an Amazon purchase's one-time cost aren't the same kind of
-- number, and conflating them would make any later aggregation (e.g.
-- "total monthly spend") silently wrong.

create type ownership_status as enum ('purchased', 'rented');

alter table devices
  add column ownership_status ownership_status,
  add column monthly_price numeric,
  add column purchase_price numeric;

-- Recreate import_devices to also sync these three fields, same
-- coalesce-on-update / direct-set-on-insert pattern as every other column.
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
      assigned_at date,
      ownership_status ownership_status,
      monthly_price numeric,
      purchase_price numeric
    )
  loop
    select id into target_device_id from devices where serial_number = row_data.serial_number;

    if target_device_id is null then
      insert into devices (
        serial_number, device_name, origin, order_date, enrollment_status, enrolled_at,
        ownership_status, monthly_price, purchase_price
      )
      values (
        row_data.serial_number,
        row_data.device_name,
        row_data.origin,
        row_data.order_date,
        coalesce(row_data.enrollment_status, 'not_enrolled'),
        row_data.enrolled_at,
        row_data.ownership_status,
        row_data.monthly_price,
        row_data.purchase_price
      )
      returning id into target_device_id;
    else
      update devices set
        device_name = row_data.device_name,
        origin = coalesce(row_data.origin, origin),
        order_date = coalesce(row_data.order_date, order_date),
        enrollment_status = coalesce(row_data.enrollment_status, enrollment_status),
        enrolled_at = coalesce(row_data.enrolled_at, enrolled_at),
        ownership_status = coalesce(row_data.ownership_status, ownership_status),
        monthly_price = coalesce(row_data.monthly_price, monthly_price),
        purchase_price = coalesce(row_data.purchase_price, purchase_price)
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
