-- Reassigning a device is a single insert, never a two-step "close old
-- row, then open new row" that the application has to get right every
-- time. This trigger closes the previously open row automatically, so the
-- invariant is enforced by the database, not by every caller.

create or replace function public.close_previous_assignment()
returns trigger as $$
begin
  update device_assignments
  set unassigned_at = new.assigned_at
  where device_id = new.device_id
    and unassigned_at is null
    and id <> new.id;
  return new;
end;
$$ language plpgsql;

create trigger trg_close_previous_assignment
after insert on device_assignments
for each row execute function public.close_previous_assignment();
