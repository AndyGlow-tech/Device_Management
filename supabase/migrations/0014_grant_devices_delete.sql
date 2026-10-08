-- 0013 added an RLS delete *policy* on devices (for merge_devices) but
-- never granted the base DELETE privilege to `authenticated` -- 0005 only
-- granted select/insert/update. RLS policies are only consulted after the
-- table-level grant already permits the operation, so every merge attempt
-- fails with "permission denied for table devices" before the policy is
-- even evaluated.

grant delete on public.devices to authenticated;
