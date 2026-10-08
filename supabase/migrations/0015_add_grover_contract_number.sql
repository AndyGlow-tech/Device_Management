-- Grover devices are identified by a rental contract number the same way
-- Amazon devices are identified by an order number -- a plain reference
-- field, not an alternate identity (Grover devices still carry a real
-- serial_number), so it's just a nullable column that import/merge should
-- carry through like every other optional field.

alter table devices
  add column grover_contract_number text;

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
        serial_number, device_name, origin, order_date, enrollment_status, enrolled_at,
        ownership_status, monthly_price, purchase_price, amazon_order_number,
        grover_contract_number
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
        row_data.amazon_order_number,
        row_data.grover_contract_number
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
      serial_number = coalesce(k.serial_number, d.serial_number)
  from devices d
  where k.id = keep_id and d.id = duplicate_id;

  delete from devices where id = duplicate_id;
end;
$$;
