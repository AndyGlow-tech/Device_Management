import type {
  DeviceCategory,
  DeviceOrigin,
  EnrollmentStatus,
  OwnershipStatus,
} from "@/types/database.types";
import type { ImportRow } from "@/app/dashboard/actions";
import { categorizeDevice, DEVICE_CATEGORIES } from "@/lib/categorizeDevice";
import { DEVICE_CATEGORY_LABEL, ENROLLMENT_STATUS_LABEL } from "@/lib/format";

const DEVICE_ORIGINS: DeviceOrigin[] = [
  "amazon",
  "apple_store",
  "grover",
  "topi",
  "other",
];
const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "enrolled",
  "not_enrolled",
  "pending",
  "removed",
  "ready_to_enroll",
  "pending_enrollment",
  "returned",
];
const OWNERSHIP_STATUSES: OwnershipStatus[] = ["purchased", "rented"];

const ENROLLMENT_STATUS_ALIASES: Record<string, EnrollmentStatus> = {
  unenrolled: "not_enrolled",
};

// MDM "Device Type" is often a platform (Mac, iPhone), not our Laptop /
// Computer split. Map only values that are actually specific; otherwise
// fall back to categorizing the device name.
const DEVICE_TYPE_CATEGORY: Record<string, DeviceCategory> = {
  laptop: "laptop",
  notebook: "laptop",
  macbook: "laptop",
  computer: "computer",
  desktop: "computer",
  imac: "computer",
  phone: "phone",
  iphone: "phone",
  smartphone: "phone",
  android: "phone",
  ipad: "tablet",
  tablet: "tablet",
};

export type RawImportRow = Record<string, unknown>;

export type ImportRowResult = {
  rowNumber: number;
  row: ImportRow | null;
  errors: string[];
  isEmpty: boolean;
  categorySource: "device_type" | "name" | null;
};

export type ImportDigest = {
  mapped: { source: string; field: string; label: string }[];
  ignored: string[];
  valueNotes: { label: string; detail: string }[];
  notes: string[];
  counts: {
    rows: number;
    imported: number;
    empty: number;
    errors: number;
  };
};

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function cellToDate(value: unknown): { value: string | null; error?: string } {
  const str = cellToString(value);
  if (!str) return { value: null };
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    return { value: null, error: `invalid date "${str}"` };
  }
  return { value: date.toISOString().slice(0, 10) };
}

function cellToNumber(value: unknown): { value: number | null; error?: string } {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { value }
      : { value: null, error: `invalid number "${value}"` };
  }
  const str = cellToString(value);
  if (!str) return { value: null };
  // Accept "66.99", "66,99", "€66.99", "66,99 €" etc.
  const cleaned = str.replace(/[€$\s]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) {
    return { value: null, error: `invalid number "${str}"` };
  }
  return { value: parsed };
}

// Each field accepts our own canonical header plus known aliases from
// external exports (e.g. a Deeploi MDM report) so those files can be
// uploaded as-is, without renaming columns first. Matching is
// case-insensitive.
const FIELD_ALIASES: Record<string, string[]> = {
  serial_number: ["serial_number", "serial number"],
  device_name: ["device_name", "name"],
  origin: ["origin"],
  category: ["category", "device type"],
  order_date: ["order_date"],
  enrollment_status: ["enrollment_status", "enrollment status"],
  enrolled_at: ["enrolled_at", "enrolled at"],
  owner_name: ["owner_name", "assigned to"],
  owner_email: ["owner_email"],
  assigned_at: ["assigned_at"],
  ownership_status: ["ownership_status", "ownership status"],
  monthly_price: ["monthly_price", "monthly price"],
  purchase_price: ["purchase_price", "purchase price"],
  amazon_order_number: ["amazon_order_number", "amazon order number"],
  grover_contract_number: ["grover_contract_number", "grover contract number"],
};

const FIELD_LABELS: Record<keyof typeof FIELD_ALIASES, string> = {
  serial_number: "Serial number",
  device_name: "Device name",
  origin: "Origin",
  category: "Category",
  order_date: "Order date",
  enrollment_status: "Enrollment status",
  enrolled_at: "Enrolled at",
  owner_name: "Assignee",
  owner_email: "Email",
  assigned_at: "Assigned at",
  ownership_status: "Ownership",
  monthly_price: "Monthly price",
  purchase_price: "Purchase price",
  amazon_order_number: "Amazon order number",
  grover_contract_number: "Grover contract number",
};

function fieldForSourceColumn(column: string): keyof typeof FIELD_ALIASES | null {
  const needle = column.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === needle)) {
      return field as keyof typeof FIELD_ALIASES;
    }
  }
  return null;
}

function getField(row: RawImportRow, field: keyof typeof FIELD_ALIASES): unknown {
  const aliases = FIELD_ALIASES[field];
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const match = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (match) return row[match];
  }
  return undefined;
}

function parseEnrollmentStatus(raw: string | null): {
  value: EnrollmentStatus | null;
  error?: string;
} {
  if (!raw) return { value: null };
  const normalized = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const mapped = ENROLLMENT_STATUS_ALIASES[normalized] ?? normalized;
  if (ENROLLMENT_STATUSES.includes(mapped as EnrollmentStatus)) {
    return { value: mapped as EnrollmentStatus };
  }
  return { value: null, error: `invalid enrollment_status "${raw}"` };
}

function resolveCategory(
  deviceType: string | null,
  deviceName: string,
): { category: DeviceCategory; source: "device_type" | "name" } {
  if (deviceType) {
    const mapped = DEVICE_TYPE_CATEGORY[deviceType.toLowerCase().trim()];
    if (mapped) return { category: mapped, source: "device_type" };
    if (DEVICE_CATEGORIES.includes(deviceType.toLowerCase().trim() as DeviceCategory)) {
      return {
        category: deviceType.toLowerCase().trim() as DeviceCategory,
        source: "device_type",
      };
    }
  }
  return { category: categorizeDevice(deviceName), source: "name" };
}

export function normalizeAndValidateRows(
  rawRows: RawImportRow[],
): ImportRowResult[] {
  const results: ImportRowResult[] = rawRows.map((raw, index) => {
    const errors: string[] = [];
    const serialNumber = cellToString(getField(raw, "serial_number"));
    const amazonOrderNumber = cellToString(getField(raw, "amazon_order_number"));
    const groverContractNumber = cellToString(
      getField(raw, "grover_contract_number"),
    );
    const deviceName = cellToString(getField(raw, "device_name"));
    const originRaw =
      cellToString(getField(raw, "origin"))?.toLowerCase() ?? null;
    const enrollmentParsed = parseEnrollmentStatus(
      cellToString(getField(raw, "enrollment_status")),
    );
    if (enrollmentParsed.error) errors.push(enrollmentParsed.error);
    const ownerName = cellToString(getField(raw, "owner_name"));
    let ownerEmail = cellToString(getField(raw, "owner_email"));
    if (!ownerEmail && ownerName?.includes("@")) ownerEmail = ownerName;

    // A device needs an identity: either a real serial_number, or (for a
    // serial-less Amazon device) an amazon_order_number -- Amazon never
    // exposes a real serial, so that's the alternate identity path.
    if (!serialNumber && !amazonOrderNumber) {
      errors.push("missing serial_number (or amazon_order_number)");
    }
    if (!deviceName) errors.push("missing device_name");

    let origin: DeviceOrigin | null = null;
    if (originRaw) {
      if (!DEVICE_ORIGINS.includes(originRaw as DeviceOrigin)) {
        errors.push(`invalid origin "${originRaw}"`);
      } else {
        origin = originRaw as DeviceOrigin;
      }
    }

    const ownershipStatusRaw =
      cellToString(getField(raw, "ownership_status"))?.toLowerCase() ?? null;
    let ownershipStatus: OwnershipStatus | null = null;
    if (ownershipStatusRaw) {
      if (!OWNERSHIP_STATUSES.includes(ownershipStatusRaw as OwnershipStatus)) {
        errors.push(`invalid ownership_status "${ownershipStatusRaw}"`);
      } else {
        ownershipStatus = ownershipStatusRaw as OwnershipStatus;
      }
    }

    const orderDate = cellToDate(getField(raw, "order_date"));
    if (orderDate.error) errors.push(`order_date: ${orderDate.error}`);
    const enrolledAt = cellToDate(getField(raw, "enrolled_at"));
    if (enrolledAt.error) errors.push(`enrolled_at: ${enrolledAt.error}`);
    const assignedAt = cellToDate(getField(raw, "assigned_at"));
    if (assignedAt.error) errors.push(`assigned_at: ${assignedAt.error}`);

    const monthlyPrice = cellToNumber(getField(raw, "monthly_price"));
    if (monthlyPrice.error) errors.push(`monthly_price: ${monthlyPrice.error}`);
    const purchasePrice = cellToNumber(getField(raw, "purchase_price"));
    if (purchasePrice.error) errors.push(`purchase_price: ${purchasePrice.error}`);

    const resolvedCategory = deviceName
      ? resolveCategory(cellToString(getField(raw, "category")), deviceName)
      : null;

    const row: ImportRow | null =
      errors.length === 0 && (serialNumber || amazonOrderNumber) && deviceName
        ? {
            serial_number: serialNumber,
            device_name: deviceName,
            origin,
            category: resolvedCategory?.category ?? null,
            order_date: orderDate.value,
            enrollment_status: enrollmentParsed.value,
            enrolled_at: enrolledAt.value,
            owner_name: ownerName,
            owner_email: ownerEmail,
            assigned_at: assignedAt.value,
            ownership_status: ownershipStatus,
            monthly_price: monthlyPrice.value,
            purchase_price: purchasePrice.value,
            amazon_order_number: amazonOrderNumber,
            grover_contract_number: groverContractNumber,
          }
        : null;

    // A row is only "empty" (safe to silently drop) when every identity
    // field is missing -- there's no way to make anything of it. A row
    // missing just some of them (e.g. a name but no serial or order
    // number) is a real gap someone needs to go fix, not filler to discard.
    const isEmpty =
      serialNumber === null && amazonOrderNumber === null && deviceName === null;

    // Header row is row 1 in the source file, so the first data row is 2.
    return {
      rowNumber: index + 2,
      row,
      errors,
      isEmpty,
      categorySource: resolvedCategory?.source ?? null,
    };
  });

  // Only a real serial_number is a hard identity -- two rows claiming the
  // same physical serial in one file is a genuine data error. A row
  // identified by amazon_order_number instead has no such guarantee: an
  // Amazon order can contain several identical units (same order number,
  // same device_name), which is legitimate, not a duplicate to reject --
  // import_devices already documents collapsing those onto one device as
  // an accepted limitation, so the file-level validation shouldn't block
  // them either.
  const serialCounts = new Map<string, number>();
  for (const result of results) {
    if (result.row?.serial_number) {
      const key = result.row.serial_number;
      serialCounts.set(key, (serialCounts.get(key) ?? 0) + 1);
    }
  }

  return results.map((result) => {
    if (
      result.row?.serial_number &&
      (serialCounts.get(result.row.serial_number) ?? 0) > 1
    ) {
      return {
        ...result,
        row: null,
        errors: [...result.errors, "duplicate serial_number in this file"],
      };
    }
    return result;
  });
}

export function buildImportDigest(
  rawRows: RawImportRow[],
  results: ImportRowResult[],
): ImportDigest {
  const sourceColumns = new Set<string>();
  for (const raw of rawRows) {
    for (const key of Object.keys(raw)) {
      if (key.trim()) sourceColumns.add(key);
    }
  }

  const mapped: ImportDigest["mapped"] = [];
  const ignored: string[] = [];
  const mappedFields = new Set<string>();

  for (const source of [...sourceColumns].sort((a, b) => a.localeCompare(b))) {
    const field = fieldForSourceColumn(source);
    if (field) {
      mapped.push({ source, field, label: FIELD_LABELS[field] });
      mappedFields.add(field);
    } else {
      ignored.push(source);
    }
  }

  const valueNotes: ImportDigest["valueNotes"] = [];
  const deviceTypes = new Map<string, { source: "device_type" | "name"; category: DeviceCategory }>();
  const enrollmentValues = new Map<string, EnrollmentStatus | "invalid">();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const result = results[i];
    const typeRaw = cellToString(getField(raw, "category"));
    if (typeRaw && result?.row?.category && result.categorySource) {
      if (!deviceTypes.has(typeRaw)) {
        deviceTypes.set(typeRaw, {
          source: result.categorySource,
          category: result.row.category,
        });
      }
    }
    const enrollmentRaw = cellToString(getField(raw, "enrollment_status"));
    if (enrollmentRaw && !enrollmentValues.has(enrollmentRaw)) {
      enrollmentValues.set(
        enrollmentRaw,
        result?.row?.enrollment_status ?? "invalid",
      );
    }
  }

  for (const [raw, info] of deviceTypes) {
    if (info.source === "name") {
      valueNotes.push({
        label: `Device Type “${raw}”`,
        detail: `too generic for Laptop vs Computer — category taken from Name (${DEVICE_CATEGORY_LABEL[info.category]})`,
      });
    } else {
      valueNotes.push({
        label: `Device Type “${raw}”`,
        detail: `→ ${DEVICE_CATEGORY_LABEL[info.category]}`,
      });
    }
  }

  for (const [raw, mappedStatus] of enrollmentValues) {
    if (mappedStatus === "invalid") {
      valueNotes.push({
        label: `Enrollment Status “${raw}”`,
        detail: "not a known status — this blocks the import",
      });
    } else {
      valueNotes.push({
        label: `Enrollment Status “${raw}”`,
        detail: `→ ${ENROLLMENT_STATUS_LABEL[mappedStatus]}`,
      });
    }
  }

  const inferredFromName = results.some((result) => result.categorySource === "name");

  const notes: string[] = [];
  if (!mappedFields.has("origin")) {
    notes.push("No origin column — existing origin is kept; new devices stay blank.");
  }
  if (!mappedFields.has("assigned_at") && mappedFields.has("owner_name")) {
    notes.push("No assignment date — new assignments use today’s date.");
  }
  if (inferredFromName && mappedFields.has("category")) {
    notes.push(
      "Some categories are inferred from Name because Device Type is a platform (e.g. Mac), not Laptop vs Computer.",
    );
  } else if (!mappedFields.has("category")) {
    notes.push("No Device Type column — category is inferred from the device name.");
  }
  if (ignored.length > 0) {
    notes.push("Unmapped columns are ignored and not stored.");
  }

  return {
    mapped,
    ignored,
    valueNotes,
    notes,
    counts: {
      rows: results.length,
      imported: results.filter((result) => result.row && result.errors.length === 0).length,
      empty: results.filter((result) => result.isEmpty).length,
      errors: results.filter((result) => result.errors.length > 0).length,
    },
  };
}

export function parseJsonRows(text: string): RawImportRow[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of device rows.");
  }
  return parsed as RawImportRow[];
}
