-- Delete all Amazon-sourced devices and their associated assignment history.
-- Amazon devices historically lacked real serial numbers, using synthesized
-- identifiers instead — this cleanup removes those entries entirely.

delete from device_assignments
where device_id in (select id from devices where origin = 'amazon');

delete from devices
where origin = 'amazon';
