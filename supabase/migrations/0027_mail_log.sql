-- Mail log: a record of mails we've sent about a device (enrollment
-- reminders, return requests), each with a link back to the mail and a
-- short description. Same shape as asana_tasks (jsonb array, one source of
-- truth, no child table -- the list is small and only ever read as a unit).
--
-- Two write paths, deliberately asymmetric:
--   - updateMailLog (manual, full replace) -- the user can add, edit, or
--     remove any entry, same as editing Asana tasks.
--   - import_mail_log (bulk, append-only) -- Claude reads a filtered export
--     of devices, checks Gmail, and reports back a spreadsheet; this only
--     ever appends new entries (deduped by message_id/mail_link), and can
--     never edit or remove what's already there.
--
-- `label` is intentionally a free-text column checked against a fixed list
-- in application code (see src/lib/mailLog.ts), not a Postgres enum --
-- the set is expected to grow and a plain check keeps that a one-line change
-- instead of a migration.
--
-- Matching: these mails never carry a device serial, only the recipient's
-- name (Grover/Amazon confirmations do, return/enrollment reminders don't).
-- So a row matches by serial_number when given one, otherwise by recipient
-- name against whoever currently has a device assigned -- and against ALL
-- of their currently-assigned devices, not just one, since a mail like
-- "Rücksendung der Geräte" ("return of the devices", plural) usually covers
-- everything that person has, not a single item. Devices they *used to*
-- have (already-closed assignments) are deliberately not matched, to avoid
-- widening the candidate pool further; an unmatched name just shows up as
-- "not found" in the preview for a human to handle.
--
-- (idempotent: safe to re-run if an earlier version of this migration was
-- already applied)

alter table devices
  add column if not exists mail_log jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mail_log_is_array') then
    alter table devices
      add constraint mail_log_is_array
      check (jsonb_typeof(mail_log) = 'array');
  end if;
end $$;

create or replace function public.import_mail_log(rows jsonb, dry_run boolean default false)
returns jsonb
language plpgsql
as $$
declare
  row_data record;
  target_ids uuid[];
  target_names text[];
  matched_count int;
  added_count int;
  is_duplicate boolean;
  outcome text;
  entry jsonb;
  each_id uuid;
  results jsonb := '[]'::jsonb;
begin
  for row_data in
    select *
    from jsonb_to_recordset(rows) as x(
      serial_number text,
      label text,
      recipient text,
      mail_link text,
      description text,
      sent_at date,
      message_id text
    )
  loop
    target_ids := null;
    target_names := null;
    matched_count := 0;
    added_count := 0;
    outcome := null;

    if row_data.label is null or row_data.label not in ('enrollment_reminder', 'return_request') then
      outcome := 'invalid_label';
    elsif row_data.mail_link is null or (row_data.serial_number is null and row_data.recipient is null) then
      outcome := 'invalid';
    else
      if row_data.serial_number is not null then
        select array_agg(id), array_agg(device_name) into target_ids, target_names
        from devices
        where lower(serial_number) = lower(btrim(row_data.serial_number));
      else
        -- Current assignment only -- see note above on why history isn't matched.
        select array_agg(d.id), array_agg(d.device_name) into target_ids, target_names
        from devices d
        join device_assignments a on a.device_id = d.id and a.unassigned_at is null
        where lower(btrim(a.user_name)) = lower(btrim(row_data.recipient));
      end if;

      matched_count := coalesce(array_length(target_ids, 1), 0);

      if matched_count = 0 then
        outcome := 'not_found';
      else
        entry := jsonb_build_object(
          'label', row_data.label,
          'recipient', row_data.recipient,
          'mail_link', row_data.mail_link,
          'description', row_data.description,
          'sent_at', row_data.sent_at,
          'message_id', row_data.message_id
        );

        foreach each_id in array target_ids loop
          select exists(
            select 1
            from devices dd, jsonb_array_elements(dd.mail_log) e
            where dd.id = each_id
              and (
                (row_data.message_id is not null and e ->> 'message_id' = row_data.message_id)
                or (row_data.message_id is null and e ->> 'mail_link' = row_data.mail_link)
              )
          ) into is_duplicate;

          if not is_duplicate then
            added_count := added_count + 1;
            if not dry_run then
              update devices set mail_log = mail_log || jsonb_build_array(entry)
              where id = each_id;
            end if;
          end if;
        end loop;

        outcome := case when added_count > 0 then 'added' else 'duplicate' end;
      end if;
    end if;

    results := results || jsonb_build_array(jsonb_build_object(
      'serial_number', row_data.serial_number,
      'recipient', row_data.recipient,
      'outcome', outcome,
      'device_names', to_jsonb(coalesce(target_names, array[]::text[])),
      'matched_count', matched_count,
      'added_count', added_count
    ));
  end loop;

  return results;
end;
$$;

grant execute on function public.import_mail_log(jsonb, boolean) to authenticated;
revoke execute on function public.import_mail_log(jsonb, boolean) from anon, public;
