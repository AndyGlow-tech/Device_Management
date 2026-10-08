-- Honor an explicit category from import (Deeploi "Device Type" when it
-- maps cleanly) instead of always overwriting from the device name.
-- If the caller omits category it stays null long enough for the trigger
-- to infer from the name; addDevice and import always send a value.

create or replace function public.set_device_category_from_name()
returns trigger
language plpgsql
as $$
begin
  if new.category is null then
    new.category := public.categorize_device(new.device_name);
  end if;
  return new;
end;
$$;

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
      category device_category,
      order_date date,
      enrollment_status enrollment_status,
      enrolled_at date,
      owner_name text,
      owner_email text,
      assigned_at date,
      ownership_status ownership_status,
      monthly_price numeric,
      purchase_price numeric,
      amazon_order_number text,
      grover_contract_number text
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
        serial_number, device_name, origin, category, order_date, enrollment_status, enrolled_at,
        ownership_status, monthly_price, purchase_price, amazon_order_number,
        grover_contract_number
      )
      values (
        row_data.serial_number,
        row_data.device_name,
        row_data.origin,
        coalesce(row_data.category, public.categorize_device(row_data.device_name)),
        row_data.order_date,
        coalesce(row_data.enrollment_status, 'not_enrolled'),
        row_data.enrolled_at,
        row_data.ownership_status,
        row_data.monthly_price,
        row_data.purchase_price,
        row_data.amazon_order_number,
        row_data.grover_contract_number
      )
      returning id into target_device_id;
    else
      update devices set
        device_name = row_data.device_name,
        origin = coalesce(row_data.origin, origin),
        category = coalesce(row_data.category, category),
        order_date = coalesce(row_data.order_date, order_date),
        enrollment_status = coalesce(row_data.enrollment_status, enrollment_status),
        enrolled_at = coalesce(row_data.enrolled_at, enrolled_at),
        ownership_status = coalesce(row_data.ownership_status, ownership_status),
        monthly_price = coalesce(row_data.monthly_price, monthly_price),
        purchase_price = coalesce(row_data.purchase_price, purchase_price),
        serial_number = coalesce(devices.serial_number, row_data.serial_number),
        amazon_order_number = coalesce(devices.amazon_order_number, row_data.amazon_order_number),
        grover_contract_number = coalesce(devices.grover_contract_number, row_data.grover_contract_number)
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
