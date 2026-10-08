-- Track the source and timestamp of the last import for each device.
-- This lets users know when a device was last touched via bulk import.

alter table devices
  add column last_import_source text,
  add column last_import_at timestamp;

-- Update import_devices to accept and set import_source
create or replace function public.import_devices(rows jsonb, import_source text default null)
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
        grover_contract_number, last_import_source, last_import_at
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
        row_data.grover_contract_number,
        import_source,
        now()
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
        grover_contract_number = coalesce(devices.grover_contract_number, row_data.grover_contract_number),
        last_import_source = coalesce(import_source, last_import_source),
        last_import_at = coalesce(case when import_source is not null then now() else null end, last_import_at)
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

grant execute on function public.import_devices(jsonb, text) to authenticated;
revoke execute on function public.import_devices(jsonb, text) from anon, public;
