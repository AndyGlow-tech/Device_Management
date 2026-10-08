"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-state";
import type { AsanaTask, DeviceCategory, DeviceOrigin, EnrollmentStatus, Json, MailLogEntry, OwnershipStatus } from "@/types/database.types";
import { categorizeDevice } from "@/lib/categorizeDevice";
import { parseAsanaTasks, validateAsanaTasks } from "@/lib/asana";
import { parseMailLog, validateMailLog } from "@/lib/mailLog";
import type { ReturnedRow } from "@/lib/import-returned";
import type { MailLogRow } from "@/lib/import-mail-log";

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

export async function addDevice(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const serialNumber = str(formData, "serial_number");
  const deviceName = str(formData, "device_name");
  const origin = str(formData, "origin") as DeviceOrigin | null;
  const orderDate = str(formData, "order_date");

  if (!serialNumber || !deviceName) {
    return { status: "error", message: "Serial number and device name are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("devices").insert({
    serial_number: serialNumber,
    device_name: deviceName,
    origin,
    order_date: orderDate,
    category: categorizeDevice(deviceName),
  });

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505" ? "That serial number already exists." : error.message,
    };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function reassignDevice(
  deviceId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userName = str(formData, "user_name");
  const userEmail = str(formData, "user_email");
  const assignedAt = str(formData, "assigned_at");
  const description = str(formData, "description");

  if (!assignedAt) {
    return { status: "error", message: "Effective date is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("device_assignments").insert({
    device_id: deviceId,
    user_name: userName,
    user_email: userEmail,
    assigned_at: assignedAt,
    changed_by: user?.email ?? null,
    description,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function updateAssignmentDescription(
  assignmentId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const description = str(formData, "description");

  const supabase = await createClient();
  const { error } = await supabase
    .from("device_assignments")
    .update({ description })
    .eq("id", assignmentId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function updateEnrollment(
  deviceId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const enrollmentStatus = str(
    formData,
    "enrollment_status",
  ) as EnrollmentStatus | null;
  const enrolledAt = str(formData, "enrolled_at");

  if (!enrollmentStatus) {
    return { status: "error", message: "Enrollment status is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("devices")
    .update({ enrollment_status: enrollmentStatus, enrolled_at: enrolledAt })
    .eq("id", deviceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function updateAsanaTasks(
  deviceId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = str(formData, "asana_tasks");
  let tasks: AsanaTask[];
  try {
    tasks = parseAsanaTasks(raw ? JSON.parse(raw) : []);
  } catch {
    return { status: "error", message: "Could not read Asana tasks." };
  }

  const validationError = validateAsanaTasks(tasks);
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("devices")
    .update({ asana_tasks: tasks })
    .eq("id", deviceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

// Full replace, same as updateAsanaTasks -- this is the only path that can
// edit or remove a mail log entry. The bulk import (importMailLog, below)
// can only append new ones.
export async function updateMailLog(
  deviceId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = str(formData, "mail_log");
  let entries: MailLogEntry[];
  try {
    entries = parseMailLog(raw ? JSON.parse(raw) : []);
  } catch {
    return { status: "error", message: "Could not read the mail log." };
  }

  const validationError = validateMailLog(entries);
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("devices")
    .update({ mail_log: entries })
    .eq("id", deviceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function updateSerialNumber(
  deviceId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const serialNumber = str(formData, "serial_number");

  if (!serialNumber) {
    return { status: "error", message: "Serial number is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("devices")
    .update({ serial_number: serialNumber })
    .eq("id", deviceId);

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("devices")
        .select("id")
        .eq("serial_number", serialNumber)
        .neq("id", deviceId)
        .maybeSingle();

      if (existing) {
        return {
          status: "conflict",
          message: "That serial number already exists on another device.",
          conflictingDeviceId: existing.id,
        };
      }
    }
    return {
      status: "error",
      message:
        error.code === "23505" ? "That serial number already exists." : error.message,
    };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function deleteDevice(deviceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", deviceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function mergeDevices(
  keepId: string,
  duplicateId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_devices", {
    keep_id: keepId,
    duplicate_id: duplicateId,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export type ImportRow = {
  serial_number: string | null;
  device_name: string;
  origin: DeviceOrigin | null;
  category: DeviceCategory | null;
  order_date: string | null;
  enrollment_status: EnrollmentStatus | null;
  enrolled_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  assigned_at: string | null;
  ownership_status: OwnershipStatus | null;
  monthly_price: number | null;
  purchase_price: number | null;
  amazon_order_number: string | null;
  grover_contract_number: string | null;
};

export async function importDevices(
  rows: ImportRow[],
  importSource?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("import_devices", {
    rows: rows as unknown as Json,
    import_source: importSource || null,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard");
  return { status: "success" };
}

export async function exportDevices(filtered: boolean, deviceIds?: string[]): Promise<string> {
  const supabase = await createClient();

  let query = supabase
    .from("devices")
    .select(`
      id, serial_number, device_name, origin, order_date, enrollment_status,
      enrolled_at, ownership_status, monthly_price, purchase_price,
      amazon_order_number, grover_contract_number, category, last_import_source,
      last_import_at
    `);

  if (filtered && deviceIds && deviceIds.length > 0) {
    query = query.in("id", deviceIds);
  }

  const { data: devices, error } = await query;

  if (error) {
    throw new Error(`Failed to export devices: ${error.message}`);
  }

  const deviceIds_ = (devices || []).map((d: any) => d.id);
  const { data: allAssignments } = await supabase
    .from("device_assignments")
    .select(
      "device_id, user_name, user_email, assigned_at, unassigned_at, changed_by",
    )
    .in("device_id", deviceIds_)
    .order("assigned_at", { ascending: false });

  const assignmentsByDevice = new Map<string, any[]>();
  (allAssignments || []).forEach((a: any) => {
    if (!assignmentsByDevice.has(a.device_id)) {
      assignmentsByDevice.set(a.device_id, []);
    }
    assignmentsByDevice.get(a.device_id)!.push(a);
  });

  const headers = [
    "Serial Number",
    "Device Name",
    "Category",
    "Origin",
    "Order Date",
    "Enrolled Date",
    "Enrollment Status",
    "Ownership Status",
    "Monthly Price",
    "Purchase Price",
    "Amazon Order Number",
    "Grover Contract Number",
    "Last Import Source",
    "Last Import At",
    "Assignee",
    "Email",
    "Assigned At",
    "Unassigned At",
    "Changed By",
  ];

  const rows: any[] = [];
  (devices || []).forEach((device: any) => {
    const assignments = assignmentsByDevice.get(device.id) || [];
    if (assignments.length === 0) {
      rows.push([
        device.serial_number || "",
        device.device_name,
        device.category || "",
        device.origin || "",
        device.order_date || "",
        device.enrolled_at || "",
        device.enrollment_status || "",
        device.ownership_status || "",
        device.monthly_price || "",
        device.purchase_price || "",
        device.amazon_order_number || "",
        device.grover_contract_number || "",
        device.last_import_source || "",
        device.last_import_at || "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      assignments.forEach((assignment: any) => {
        rows.push([
          device.serial_number || "",
          device.device_name,
          device.category || "",
          device.origin || "",
          device.order_date || "",
          device.enrolled_at || "",
          device.enrollment_status || "",
          device.ownership_status || "",
          device.monthly_price || "",
          device.purchase_price || "",
          device.amazon_order_number || "",
          device.grover_contract_number || "",
          device.last_import_source || "",
          device.last_import_at || "",
          assignment.user_name || "",
          assignment.user_email || "",
          assignment.assigned_at || "",
          assignment.unassigned_at || "",
          assignment.changed_by || "",
        ]);
      });
    }
  });

  const csv =
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell: any) => {
            const str = String(cell || "");
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(","),
      )
      .join("\n") + "\n";

  return csv;
}

export type ReturnedOutcome =
  | "returned"
  | "already_returned"
  | "not_found"
  | "ambiguous";

export type ReturnedPreviewItem = {
  serial_number: string;
  outcome: ReturnedOutcome;
  device_name: string | null;
  matched_serial: string | null;
};

export type ReturnedPreviewResult =
  | { status: "success"; items: ReturnedPreviewItem[] }
  | { status: "error"; message: string };

// dryRun = true reports what each row would do without writing anything.
export async function importReturnedDevices(
  rows: ReturnedRow[],
  options: { dryRun: boolean; importSource?: string },
): Promise<ReturnedPreviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_returned_devices", {
    rows: rows as unknown as Json,
    import_source: options.importSource || null,
    dry_run: options.dryRun,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  if (!options.dryRun) revalidatePath("/dashboard");
  return { status: "success", items: data as unknown as ReturnedPreviewItem[] };
}

export type MailLogOutcome = "added" | "duplicate" | "not_found" | "invalid_label" | "invalid";

export type MailLogPreviewItem = {
  serial_number: string | null;
  recipient: string | null;
  outcome: MailLogOutcome;
  // Every currently-matched device (can be more than one when matched by
  // name -- see 0027_mail_log.sql), and how many of those actually got a
  // new entry (the rest already had it).
  device_names: string[];
  matched_count: number;
  added_count: number;
};

export type MailLogPreviewResult =
  | { status: "success"; items: MailLogPreviewItem[] }
  | { status: "error"; message: string };

// Append-only: dryRun = true only reports what each row would do. The real
// run can only add new entries, never edit or remove an existing one -- see
// 0027_mail_log.sql.
export async function importMailLog(
  rows: MailLogRow[],
  options: { dryRun: boolean },
): Promise<MailLogPreviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_mail_log", {
    rows: rows as unknown as Json,
    dry_run: options.dryRun,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  if (!options.dryRun) revalidatePath("/dashboard");
  return { status: "success", items: data as unknown as MailLogPreviewItem[] };
}
