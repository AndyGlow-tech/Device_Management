import { createClient } from "@/lib/supabase/server";
import { DataSources } from "@/components/DataSources";
import { DeviceLifecycle } from "@/components/DeviceLifecycle";
import { DeviceTable } from "@/components/DeviceTable";
import { SignOutButton } from "@/components/SignOutButton";
import { latestImportsBySource } from "@/lib/lastImport";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [devicesResult, assignmentsResult, employeesResult] = await Promise.all([
    supabase.from("devices").select("*").order("device_name"),
    supabase
      .from("device_assignments")
      .select("*")
      .is("unassigned_at", null),
    supabase
      .from("employees")
      .select("user_name, user_email, employment_type, active"),
  ]);

  if (devicesResult.error) throw devicesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (employeesResult.error) throw employeesResult.error;

  const assignmentByDevice = new Map(
    assignmentsResult.data.map((assignment) => [
      assignment.device_id,
      assignment,
    ]),
  );

  const rows = devicesResult.data.map((device) => ({
    device,
    currentAssignment: assignmentByDevice.get(device.id) ?? null,
  }));

  const employeesByName = Object.fromEntries(
    employeesResult.data.map(({ user_name, ...info }) => [user_name, info]),
  );

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold tracking-wide text-accent">
          &gt; DEVICE_REGISTRY
        </h1>
        <SignOutButton />
      </header>
      <DeviceLifecycle />
      <DataSources lastImports={latestImportsBySource(devicesResult.data)} />
      <DeviceTable rows={rows} employeesByName={employeesByName} />
    </div>
  );
}
