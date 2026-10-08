-- Persist device category (laptop / computer / phone / other) instead of
-- deriving it only in the client. Computer is a first-class value, not
-- folded into laptop or other -- iMacs, Mini PCs, ThinkCentres, etc.
--
-- categorize_device() is the single source of truth for inference and
-- must stay in sync with src/lib/categorizeDevice.ts. A trigger fills
-- the column on insert and whenever device_name changes, so callers
-- don't have to remember to set it.

create type device_category as enum ('laptop', 'computer', 'phone', 'other');

create or replace function public.categorize_device(device_name text)
returns device_category
language sql
immutable
as $$
  select case
    when device_name ~* '(hub|dock|adapter|cable|charger|netzteil|ladegerät|case|hülle|tasche|sleeve|stand|mount|halterung)'
      then 'other'::device_category
    when device_name ~* '(thinkpad|notebook|macbook|laptop|elitebook|latitude)'
      then 'laptop'::device_category
    when device_name ~* '(imac|mac mini|mac studio|mac pro|mini pc|thinkcentre|optiplex|nucbox|minis forum|all-in-one|all in one)'
      then 'computer'::device_category
    when device_name ~* '(iphone|galaxy s|galaxy z|pixel|smartphone)'
      then 'phone'::device_category
    else 'other'::device_category
  end;
$$;

alter table devices
  add column category device_category not null default 'other';

update devices
  set category = public.categorize_device(device_name);

create or replace function public.set_device_category_from_name()
returns trigger
language plpgsql
as $$
begin
  new.category := public.categorize_device(new.device_name);
  return new;
end;
$$;

create trigger trg_set_device_category
before insert or update of device_name on devices
for each row execute function public.set_device_category_from_name();
