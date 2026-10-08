-- Enabling RLS restricts which *rows* a role can see or change; the role
-- still needs baseline table-level privileges before RLS policies are even
-- evaluated. Making these explicit rather than relying on whatever default
-- privileges this project happened to provision with.

grant usage on schema public to authenticated;
grant select, insert, update on public.devices to authenticated;
grant select, insert, update on public.device_assignments to authenticated;
grant select on public.allowed_users to authenticated;
