-- Amazon never exposes a device's real serial number, so the synthesized
-- "AMZN-<order id>-<item index>" placeholder was never a real identity --
-- it just meant Amazon-sourced devices could never match up with the same
-- physical device later reported (with its real serial) by Deeploi/MDM
-- enrollment, guaranteeing permanent duplicates.
--
-- Fix: serial_number becomes nullable (a plain unique constraint already
-- tolerates any number of nulls, so no conflict there), and a new
-- amazon_order_number column carries the real Amazon order identity
-- instead. A device with no known serial yet is genuinely unknown, not
-- fake-known -- someone fills in the real serial later via the UI once
-- it's learned (e.g. when the device shows up in a Deeploi/MDM export),
-- or via the duplicate-review flow when it's recognized as the same
-- physical device Deeploi already reported under its real serial.

alter table devices
  alter column serial_number drop not null,
  add column amazon_order_number text;

-- Recreate import_devices: match by serial_number when present (all
-- serial-bearing sources -- Grover, Deeploi/MDM, manual entry -- unchanged
-- behavior), otherwise by (amazon_order_number, device_name) for
-- serial-less Amazon rows. Known limitation: two genuinely identical items
-- in the same Amazon order (same name) aren't distinguishable this way and
-- would collapse onto one row on re-import -- accepted as a rare edge case
-- rather than adding a second disambiguating column.
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
      purchase_price numeric,
      amazon_order_number text
    )
  loop
    target_device_id := null;

    if row_data.serial_number is not null then
      select id into target_device_id from devices where serial_number = row_data.serial_number;
    elsif row_data.amazon_order_number is not null then
      select id into target_device_id
      from devices
      where amazon_order_number = row_data.amazon_order_number
        and device_name = row_data.device_name;
    end if;

    if target_device_id is null then
      insert into devices (
        serial_number, device_name, origin, order_date, enrollment_status, enrolled_at,
        ownership_status, monthly_price, purchase_price, amazon_order_number
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
        row_data.purchase_price,
        row_data.amazon_order_number
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
        purchase_price = coalesce(row_data.purchase_price, purchase_price),
        serial_number = coalesce(devices.serial_number, row_data.serial_number),
        amazon_order_number = coalesce(devices.amazon_order_number, row_data.amazon_order_number)
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
