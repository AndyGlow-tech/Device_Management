-- Deeploi both supplies devices (procurement) and enrolls them into MDM --
-- these are two independent facts about a device (origin vs
-- enrollment_status), so "deeploi" joins the origin enum the same way
-- amazon/grover/topi did, without touching enrollment_status at all.
alter type device_origin add value 'deeploi';
