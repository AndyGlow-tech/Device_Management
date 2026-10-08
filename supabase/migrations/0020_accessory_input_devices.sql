-- Mice, trackpads, and keyboards are accessories. Input-device terms are
-- checked before computer/phone/tablet (and mice/trackpads before laptop)
-- so "Magic Maus … für iMac" stays Other. Keyboards come after laptop
-- keywords so a ThinkPad listing that mentions "QWERTZ Tastatur" is still
-- a laptop, while a standalone Magic Keyboard falls through to Other.

create or replace function public.categorize_device(device_name text)
returns device_category
language sql
immutable
as $$
  select case
    when device_name ~* '(hub|dock|adapter|cable|charger|netzteil|ladegerät|case|hülle|tasche|sleeve|stand|mount|halterung|maus|mouse|trackpad)'
      then 'other'::device_category
    when device_name ~* '(thinkpad|notebook|macbook|laptop|elitebook|latitude)'
      then 'laptop'::device_category
    when device_name ~* '(tastatur|keyboard)'
      then 'other'::device_category
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
  set category = public.categorize_device(device_name);
