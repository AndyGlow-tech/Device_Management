-- "returned" = the device went back to the lender (e.g. Grover) and is no
-- longer in our custody. Kept separate from 'removed', which is an MDM state.
-- New enum values can't be used in the same transaction that adds them, so
-- the function that writes 'returned' lives in the next migration.
alter type enrollment_status add value 'returned';

-- Mail reference for the assignment that was closed by a return, so the
-- custody log can point at the confirmation mail. message_id is also the
-- idempotency key: re-importing the same mail export is a no-op.
alter table device_assignments
  add column mail_link text,
  add column mail_message_id text;

create index device_assignments_mail_message_id_idx
  on device_assignments (mail_message_id)
  where mail_message_id is not null;
