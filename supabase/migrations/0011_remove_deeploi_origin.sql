-- Undo 0010: remove 'deeploi' from device_origin again. Postgres has no
-- "drop enum value" -- the standard workaround is to build a replacement
-- type without it, swap the column over, then drop the old type and
-- rename the new one into its place.

do $$
begin
  if exists (select 1 from devices where origin = 'deeploi') then
    raise exception 'Cannot remove deeploi origin: % device(s) still have origin = deeploi. Reassign their origin first, then re-run this migration.',
      (select count(*) from devices where origin = 'deeploi');
  end if;
end $$;

create type device_origin_new as enum ('amazon', 'apple_store', 'grover', 'topi', 'other');

alter table devices
  alter column origin type device_origin_new
  using origin::text::device_origin_new;

drop type device_origin;
alter type device_origin_new rename to device_origin;
