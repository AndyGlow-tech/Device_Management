-- Infer tablet from device names now that the enum value exists, and
-- recategorize existing iPads/tablets that landed in Other.

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
    when device_name ~* '(ipad|tablet|galaxy tab)'
      then 'tablet'::device_category
    else 'other'::device_category
  end;
$$;

update devices
  set category = public.categorize_device(device_name)
  where category = 'other';
