-- Bulk "returned devices" import (mail export). Per row: find the device by
-- serial, close its open assignment with the mail reference, set the device
-- to 'returned', and optionally attach an Asana link.
--
-- Serial matching: Grover mails carry the serial with a leading "S"
-- (e.g. SCJ9QN6QN7Y) while we store it without (CJ9QN6QN7Y), and some carry
-- an extra trailing character (0E2QHNMX103453Z). Matching is tiered, exact
-- first, then looser (see below); the preview shows the matched serial.
--
-- dry_run = true only reports what each row would do (used for the preview);
-- the real run uses the same code path, so preview and result can't drift.
-- Returns one jsonb object per input row with an `outcome`:
--   returned | already_returned | not_found | ambiguous
--
-- Needs 0026 (mail_recipient column) applied first.
--
-- SECURITY INVOKER, so RLS still applies to the caller.

create or replace function public.import_returned_devices(
  rows jsonb,
  import_source text default null,
  dry_run boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  row_data record;
  raw_serial text;
  base text;
  stripped text;
  matches uuid[];
  target_id uuid;
  target_name text;
  target_serial text;
  target_status enrollment_status;
  open_id uuid;
  return_date date;
  outcome text;
  results jsonb := '[]'::jsonb;
begin
  for row_data in
    select *
    from jsonb_to_recordset(rows) as x(
      serial_number text,
      message_id text,
      mail_link text,
      mail_recipient text,
      returned_at date,
      asana_url text,
      asana_title text
    )
  loop
    raw_serial := btrim(row_data.serial_number);
    target_id := null;
    target_name := null;
    target_serial := null;

    -- Tiered matching; the first tier that finds anything wins, so a looser
    -- tier can never override a more exact one. Mail serials and our stored
    -- serials differ by a leading "S" and/or one extra trailing character.
    --   1. exact
    --   2. with / without the leading "S"
    --   3. additionally one trailing character dropped from the mail serial
    --   4. additionally one trailing character added by the mail serial's
    --      counterpart (stored serial is the mail serial + 1 character)
    base := lower(raw_serial);
    stripped := regexp_replace(base, '^s', '');

    select array_agg(id) into matches
    from devices where lower(serial_number) = base;

    if matches is null then
      select array_agg(id) into matches
      from devices
      where lower(serial_number) in (stripped, 's' || base);
    end if;

    if matches is null then
      select array_agg(id) into matches
      from devices
      where lower(serial_number) in (
        left(base, -1), left(stripped, -1), 's' || left(base, -1)
      ) and length(left(stripped, -1)) >= 6;
    end if;

    if matches is null then
      select array_agg(id) into matches
      from devices
      where length(serial_number) = length(stripped) + 1
        and length(stripped) >= 6
        and lower(left(serial_number, length(stripped))) = stripped;
    end if;

    if matches is null then
      outcome := 'not_found';
    elsif array_length(matches, 1) > 1 then
      outcome := 'ambiguous';
    else
      target_id := matches[1];
      select device_name, serial_number, enrollment_status
        into target_name, target_serial, target_status
      from devices where id = target_id;

      if target_status = 'returned'
        or (
          row_data.message_id is not null
          and exists (
            select 1 from device_assignments where mail_message_id = row_data.message_id
          )
        ) then
        outcome := 'already_returned';
      else
        outcome := 'returned';
      end if;
    end if;

    if outcome = 'returned' and not dry_run then
      return_date := coalesce(row_data.returned_at, current_date);

      select id into open_id
      from device_assignments
      where device_id = target_id and unassigned_at is null
      order by assigned_at desc, created_at desc
      limit 1;

      if open_id is not null then
        update device_assignments
        set unassigned_at = greatest(return_date, assigned_at),
            mail_link = row_data.mail_link,
            mail_message_id = row_data.message_id,
            mail_recipient = row_data.mail_recipient,
            changed_by = (auth.jwt() ->> 'email')
        where id = open_id;

        -- Stray extra open rows (shouldn't exist) are closed without the mail ref.
        update device_assignments
        set unassigned_at = greatest(return_date, assigned_at)
        where device_id = target_id and unassigned_at is null;
      else
        -- Nobody was assigned; still record the return so the mail reference
        -- isn't lost.
        insert into device_assignments (
          device_id, assigned_at, unassigned_at, changed_by, description,
          mail_link, mail_message_id, mail_recipient
        )
        values (
          target_id, return_date, return_date, (auth.jwt() ->> 'email'),
          'Returned', row_data.mail_link, row_data.message_id,
          row_data.mail_recipient
        );
      end if;

      update devices set
        enrollment_status = 'returned',
        last_import_source = coalesce(import_source, last_import_source),
        last_import_at = case when import_source is not null then now() else last_import_at end,
        asana_tasks = case
          when row_data.asana_url is not null
            and not exists (
              select 1 from jsonb_array_elements(asana_tasks) t
              where t ->> 'url' = row_data.asana_url
            )
          then asana_tasks || jsonb_build_array(jsonb_build_object(
            'title', coalesce(row_data.asana_title, 'Device return'),
            'url', row_data.asana_url,
            'description', null
          ))
          else asana_tasks
        end
      where id = target_id;
    end if;

    results := results || jsonb_build_array(jsonb_build_object(
      'serial_number', raw_serial,
      'outcome', outcome,
      'device_name', target_name,
      'matched_serial', target_serial
    ));
  end loop;

  return results;
end;
$$;

grant execute on function public.import_returned_devices(jsonb, text, boolean) to authenticated;
revoke execute on function public.import_returned_devices(jsonb, text, boolean) from anon, public;
