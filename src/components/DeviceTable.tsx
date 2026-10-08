"use client";

import { useId, useMemo, useState, useTransition, type ToggleEvent } from "react";
import { parseAsanaTasks } from "@/lib/asana";
import { DEVICE_CATEGORIES } from "@/lib/categorizeDevice";
import { deleteDevice, exportDevices } from "@/app/dashboard/actions";
import {
  DEVICE_CATEGORY_LABEL,
  DEVICE_ORIGIN_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  formatDate,
  formatPrice,
  OWNERSHIP_STATUS_LABEL,
} from "@/lib/format";
import { MAIL_LOG_LABEL_TEXT, parseMailLog } from "@/lib/mailLog";
import type {
  AsanaTask,
  Device,
  DeviceAssignment,
  EmployeeInfo,
  MailLogEntry,
} from "@/types/database.types";
import { AddDeviceModal } from "./AddDeviceModal";
import { EditAsanaModal } from "./EditAsanaModal";
import { EditEnrollmentModal } from "./EditEnrollmentModal";
import { EditMailLogModal } from "./EditMailLogModal";
import { EditSerialModal } from "./EditSerialModal";
import { EnrollmentStats } from "./EnrollmentStats";
import { HistoryModal } from "./HistoryModal";
import { ImportMailLogModal } from "./ImportMailLogModal";
import { ImportModal } from "./ImportModal";
import { ImportReturnedModal } from "./ImportReturnedModal";
import { PossibleDuplicatesModal } from "./PossibleDuplicatesModal";
import { ReassignModal } from "./ReassignModal";
import { SearchBar } from "./SearchBar";
import { StatusBadge } from "./StatusBadge";

export type DeviceRow = {
  device: Device;
  currentAssignment: DeviceAssignment | null;
};

type ActiveModal =
  | { type: "add" }
  | { type: "import" }
  | { type: "import-returned" }
  | { type: "import-mail-log" }
  | { type: "duplicates" }
  | { type: "reassign"; deviceId: string; deviceName: string }
  | { type: "history"; deviceId: string; deviceName: string }
  | {
      type: "enrollment";
      deviceId: string;
      deviceName: string;
      status: Device["enrollment_status"];
      enrolledAt: string | null;
    }
  | {
      type: "editAsana";
      deviceId: string;
      deviceName: string;
      tasks: AsanaTask[];
    }
  | {
      type: "editMailLog";
      deviceId: string;
      deviceName: string;
      entries: MailLogEntry[];
    }
  | {
      type: "editSerial";
      deviceId: string;
      deviceName: string;
      currentSerialNumber: string | null;
      amazonOrderNumber: string | null;
    };

function resolveEmployeeInfo(
  assignment: DeviceAssignment | null,
  employeesByName: Record<string, EmployeeInfo>,
): EmployeeInfo | null {
  if (!assignment?.user_name) return null;
  return employeesByName[assignment.user_name] ?? null;
}

function resolveEmail(
  assignment: DeviceAssignment | null,
  employeesByName: Record<string, EmployeeInfo>,
): string | null {
  if (!assignment) return null;
  if (assignment.user_email) return assignment.user_email;
  return resolveEmployeeInfo(assignment, employeesByName)?.user_email ?? null;
}

// A device only ever has one of the two -- a rental's recurring monthly
// cost, or a purchase's one-time cost -- never both.
function formatDevicePrice(device: Device): string {
  if (device.monthly_price !== null) return `${formatPrice(device.monthly_price)}/mo`;
  if (device.purchase_price !== null) return formatPrice(device.purchase_price);
  return "—";
}

type ColumnFilters = {
  serial: string;
  orderNumber: string;
  groverContractNumber: string;
  assignee: string;
  email: string;
  emailPresence: string;
  employment: string;
  active: string;
  device: string;
  category: string[];
  origin: string;
  ownership: string;
  enrolledAt: string;
  asana: string;
  mailLog: string;
  status: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  serial: "",
  orderNumber: "",
  groverContractNumber: "",
  assignee: "",
  email: "",
  emailPresence: "",
  employment: "",
  active: "",
  device: "",
  category: [],
  origin: "",
  ownership: "",
  enrolledAt: "",
  asana: "",
  mailLog: "",
  status: "",
};

function TextFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder ?? "Filter…"}
      className="w-full border border-border bg-background px-2 py-1 text-xs font-normal normal-case tracking-normal text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
    />
  );
}

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border border-border bg-background px-2 py-1 text-xs font-normal normal-case tracking-normal text-foreground focus:border-accent focus:outline-none"
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectFilter({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId().replace(/:/g, "");
  const triggerId = `${id}-trigger`;
  const popoverId = `${id}-popover`;

  const summary =
    values.length === 0
      ? "All"
      : values
          .map((value) => options.find((option) => option.value === value)?.label ?? value)
          .join(", ");

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((current) => current !== value)
        : [...values, value],
    );
  }

  function positionPopover(event: ToggleEvent<HTMLDivElement>) {
    if (event.newState !== "open") return;
    const popover = event.currentTarget;
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.margin = "0";
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;
  }

  return (
    <>
      <button
        type="button"
        id={triggerId}
        popoverTarget={popoverId}
        aria-haspopup="dialog"
        aria-label="Filter by category"
        title={summary}
        className="w-full truncate border border-border bg-background px-2 py-1 text-left text-xs font-normal normal-case tracking-normal text-foreground focus:border-accent focus:outline-none"
      >
        {summary}
      </button>
      <div
        id={popoverId}
        popover="auto"
        onToggle={positionPopover}
        className="min-w-[10rem] border border-border bg-surface p-1 text-xs text-foreground"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-accent/10"
          >
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </>
  );
}

export function DeviceTable({
  rows,
  employeesByName,
}: {
  rows: DeviceRow[];
  employeesByName: Record<string, EmployeeInfo>;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const [isExporting, startExport] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function handleDeleteDevice(deviceId: string, deviceName: string) {
    if (
      !window.confirm(
        `Delete "${deviceName}"? This removes the device and its assignment history. This cannot be undone.`,
      )
    )
      return;

    setDeletingId(deviceId);
    startDelete(async () => {
      try {
        const result = await deleteDevice(deviceId);
        if (result.status === "error") {
          window.alert(`Could not delete device: ${result.message}`);
        }
      } finally {
        setDeletingId(null);
      }
    });
  }

  const setFilter = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) =>
    setFilters((previous) => ({ ...previous, [key]: value }));

  async function handleDownloadDevices(filtered: boolean) {
    startExport(async () => {
      try {
        const deviceIds = filtered
          ? filteredRows.map((row) => row.device.id)
          : undefined;
        const csv = await exportDevices(filtered, deviceIds);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute(
          "download",
          `devices-${filtered ? "filtered-" : ""}${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error("Failed to download devices:", error);
      }
    });
  }

  const hasActiveFilters =
    query.trim() !== "" ||
    Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value !== "",
    );

  const EMAIL_PRESENCE_LABEL: Record<string, string> = {
    set: "has email",
    empty: "no email",
  };
  const ACTIVE_LABEL: Record<string, string> = {
    active: "active",
    inactive: "inactive",
  };
  const ENROLLED_AT_LABEL: Record<string, string> = {
    set: "enrolled",
    empty: "not enrolled",
  };

  const filterChips: { key: string; label: string; onClear: () => void }[] = [];
  if (query.trim() !== "") {
    filterChips.push({ key: "query", label: `Search: ${query.trim()}`, onClear: () => setQuery("") });
  }
  if (filters.serial) {
    filterChips.push({
      key: "serial",
      label: `Serial: ${filters.serial}`,
      onClear: () => setFilter("serial", ""),
    });
  }
  if (filters.orderNumber) {
    filterChips.push({
      key: "orderNumber",
      label: `Order #: ${filters.orderNumber}`,
      onClear: () => setFilter("orderNumber", ""),
    });
  }
  if (filters.groverContractNumber) {
    filterChips.push({
      key: "groverContractNumber",
      label: `Grover contract: ${filters.groverContractNumber}`,
      onClear: () => setFilter("groverContractNumber", ""),
    });
  }
  if (filters.device) {
    filterChips.push({
      key: "device",
      label: `Device: ${filters.device}`,
      onClear: () => setFilter("device", ""),
    });
  }
  if (filters.category.length > 0) {
    filterChips.push({
      key: "category",
      label: `Category: ${filters.category
        .map((value) => DEVICE_CATEGORY_LABEL[value as keyof typeof DEVICE_CATEGORY_LABEL] ?? value)
        .join(", ")}`,
      onClear: () => setFilter("category", []),
    });
  }
  if (filters.origin) {
    filterChips.push({
      key: "origin",
      label: `Origin: ${DEVICE_ORIGIN_LABEL[filters.origin as keyof typeof DEVICE_ORIGIN_LABEL] ?? filters.origin}`,
      onClear: () => setFilter("origin", ""),
    });
  }
  if (filters.ownership) {
    filterChips.push({
      key: "ownership",
      label: `Ownership: ${OWNERSHIP_STATUS_LABEL[filters.ownership as keyof typeof OWNERSHIP_STATUS_LABEL] ?? filters.ownership}`,
      onClear: () => setFilter("ownership", ""),
    });
  }
  if (filters.status) {
    filterChips.push({
      key: "status",
      label: `Status: ${ENROLLMENT_STATUS_LABEL[filters.status as keyof typeof ENROLLMENT_STATUS_LABEL] ?? filters.status}`,
      onClear: () => setFilter("status", ""),
    });
  }
  if (filters.enrolledAt) {
    filterChips.push({
      key: "enrolledAt",
      label: `Enrolled at: ${ENROLLED_AT_LABEL[filters.enrolledAt] ?? filters.enrolledAt}`,
      onClear: () => setFilter("enrolledAt", ""),
    });
  }
  if (filters.assignee) {
    filterChips.push({
      key: "assignee",
      label: `Assignee: ${filters.assignee}`,
      onClear: () => setFilter("assignee", ""),
    });
  }
  if (filters.email) {
    filterChips.push({
      key: "email",
      label: `Email: ${filters.email}`,
      onClear: () => setFilter("email", ""),
    });
  }
  if (filters.emailPresence) {
    filterChips.push({
      key: "emailPresence",
      label: `Email: ${EMAIL_PRESENCE_LABEL[filters.emailPresence] ?? filters.emailPresence}`,
      onClear: () => setFilter("emailPresence", ""),
    });
  }
  if (filters.employment) {
    filterChips.push({
      key: "employment",
      label: `Employment: ${EMPLOYMENT_TYPE_LABEL[filters.employment as keyof typeof EMPLOYMENT_TYPE_LABEL] ?? filters.employment}`,
      onClear: () => setFilter("employment", ""),
    });
  }
  if (filters.active) {
    filterChips.push({
      key: "active",
      label: `Employee: ${ACTIVE_LABEL[filters.active] ?? filters.active}`,
      onClear: () => setFilter("active", ""),
    });
  }
  if (filters.asana) {
    filterChips.push({
      key: "asana",
      label: `Asana: ${filters.asana}`,
      onClear: () => setFilter("asana", ""),
    });
  }
  if (filters.mailLog) {
    filterChips.push({
      key: "mailLog",
      label: `Mail log: ${filters.mailLog}`,
      onClear: () => setFilter("mailLog", ""),
    });
  }

  function clearAllFilters() {
    setQuery("");
    setFilters(EMPTY_FILTERS);
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ device, currentAssignment }) => {
      const employeeInfo = resolveEmployeeInfo(currentAssignment, employeesByName);
      const category = device.category;
      const categoryLabel = DEVICE_CATEGORY_LABEL[category];
      const employmentLabel = employeeInfo?.employment_type
        ? EMPLOYMENT_TYPE_LABEL[employeeInfo.employment_type]
        : null;
      const activeLabel = employeeInfo ? (employeeInfo.active ? "active" : "inactive") : null;
      const ownershipLabel = device.ownership_status
        ? OWNERSHIP_STATUS_LABEL[device.ownership_status]
        : null;
      const asanaTasks = parseAsanaTasks(device.asana_tasks);
      const mailLogEntries = parseMailLog(device.mail_log);
      const email = resolveEmail(currentAssignment, employeesByName);

      if (needle) {
        const matchesQuery = [
          device.serial_number,
          device.amazon_order_number,
          device.grover_contract_number,
          device.device_name,
          category,
          categoryLabel,
          currentAssignment?.user_name,
          email,
          employmentLabel,
          activeLabel,
          ownershipLabel,
          ...asanaTasks.flatMap((task) => [task.title, task.description]),
          ...mailLogEntries.flatMap((entry) => [
            MAIL_LOG_LABEL_TEXT[entry.label],
            entry.recipient,
            entry.description,
          ]),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle));
        if (!matchesQuery) return false;
      }

      if (
        filters.serial &&
        !(device.serial_number ?? "").toLowerCase().includes(filters.serial.toLowerCase())
      )
        return false;

      if (
        filters.orderNumber &&
        !(device.amazon_order_number ?? "")
          .toLowerCase()
          .includes(filters.orderNumber.toLowerCase())
      )
        return false;

      if (
        filters.groverContractNumber &&
        !(device.grover_contract_number ?? "")
          .toLowerCase()
          .includes(filters.groverContractNumber.toLowerCase())
      )
        return false;

      if (
        filters.assignee &&
        !(currentAssignment?.user_name ?? "").toLowerCase().includes(filters.assignee.toLowerCase())
      )
        return false;

      if (filters.emailPresence === "set" && !email) return false;
      if (filters.emailPresence === "empty" && email) return false;

      if (
        filters.emailPresence !== "empty" &&
        filters.email &&
        !(email ?? "").toLowerCase().includes(filters.email.toLowerCase())
      )
        return false;

      if (filters.employment && employeeInfo?.employment_type !== filters.employment) return false;

      if (filters.active) {
        const wantActive = filters.active === "active";
        if (!employeeInfo || employeeInfo.active !== wantActive) return false;
      }

      if (
        filters.device &&
        !device.device_name.toLowerCase().includes(filters.device.toLowerCase())
      )
        return false;

      if (filters.category.length > 0 && !filters.category.includes(category)) return false;

      if (filters.origin && device.origin !== filters.origin) return false;

      if (filters.ownership && device.ownership_status !== filters.ownership) return false;

      if (filters.enrolledAt === "set" && device.enrolled_at === null) return false;
      if (filters.enrolledAt === "empty" && device.enrolled_at !== null) return false;

      if (filters.asana) {
        const haystack = asanaTasks
          .flatMap((task) => [task.title, task.description, task.url])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(filters.asana.toLowerCase())) return false;
      }

      if (filters.mailLog) {
        const haystack = mailLogEntries
          .flatMap((entry) => [
            MAIL_LOG_LABEL_TEXT[entry.label],
            entry.recipient,
            entry.description,
            entry.mail_link,
          ])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(filters.mailLog.toLowerCase())) return false;
      }

      if (filters.status && device.enrollment_status !== filters.status) return false;

      return true;
    });
  }, [rows, query, employeesByName, filters]);

  const uniqueEmails = useMemo(() => {
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const { currentAssignment } of filteredRows) {
      const email = resolveEmail(currentAssignment, employeesByName);
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    emails.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return emails;
  }, [filteredRows, employeesByName]);

  function downloadUniqueEmails() {
    const blob = new Blob([`${uniqueEmails.join("\n")}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "device-emails.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <EnrollmentStats devices={rows.map((row) => row.device)} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar value={query} onChange={setQuery} />
          <p className="text-sm tabular-nums" aria-live="polite">
            {hasActiveFilters ? (
              <>
                <span className="text-foreground">{filteredRows.length}</span>
                <span className="text-muted">
                  {" "}
                  of {rows.length} {rows.length === 1 ? "device" : "devices"}
                </span>
              </>
            ) : (
              <span className="text-muted">
                {rows.length} {rows.length === 1 ? "device" : "devices"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadUniqueEmails}
            disabled={uniqueEmails.length === 0}
            title={
              uniqueEmails.length === 0
                ? "No emails in the current view"
                : `Download ${uniqueEmails.length} unique email${uniqueEmails.length === 1 ? "" : "s"} from the current view`
            }
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
          >
            Download emails
            {uniqueEmails.length > 0 ? ` (${uniqueEmails.length})` : ""}
          </button>
          <button
            disabled={isExporting}
            title={
              filteredRows.length === 0
                ? "No devices to download"
                : `Download ${filteredRows.length} device${filteredRows.length === 1 ? "" : "s"} from the current view`
            }
            onClick={() => handleDownloadDevices(true)}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
          >
            {isExporting ? "Exporting…" : "Download filtered"}
            {filteredRows.length > 0 ? ` (${filteredRows.length})` : ""}
          </button>
          <button
            disabled={isExporting || rows.length === 0}
            title={
              rows.length === 0
                ? "No devices to download"
                : `Download all ${rows.length} device${rows.length === 1 ? "" : "s"}`
            }
            onClick={() => handleDownloadDevices(false)}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
          >
            Download all
          </button>
          <button
            onClick={() => setModal({ type: "duplicates" })}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            Possible duplicates
          </button>
          <button
            onClick={() => setModal({ type: "import" })}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            Import
          </button>
          <button
            onClick={() => setModal({ type: "import-returned" })}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            Import returned
          </button>
          <button
            onClick={() => setModal({ type: "import-mail-log" })}
            className="border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            Import mail log
          </button>
          <button
            onClick={() => setModal({ type: "add" })}
            className="glow-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
          >
            + Add device
          </button>
        </div>
      </div>

      {filterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="flex items-center gap-1.5 border border-accent/40 bg-surface px-2.5 py-1 text-xs text-foreground transition hover:border-accent hover:text-accent"
            >
              {chip.label}
              <span aria-hidden="true" className="text-muted">
                ✕
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-2.5 py-1 text-xs text-muted underline-offset-2 transition hover:text-accent hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="glow-sm overflow-x-auto border border-border">
        <table className="w-full min-w-[1550px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-xs uppercase tracking-wider text-accent">
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Order #</th>
              <th className="px-3 py-2 font-medium">Grover contract #</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Employment</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Origin</th>
              <th className="px-3 py-2 font-medium">Ownership</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Ordered</th>
              <th className="px-3 py-2 font-medium">Enrolled</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Asana</th>
              <th className="px-3 py-2 font-medium">Mail log</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
            <tr className="border-b border-border bg-surface/60">
              <th className="px-3 py-1.5">
                <TextFilter value={filters.serial} onChange={(v) => setFilter("serial", v)} />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter
                  value={filters.orderNumber}
                  onChange={(v) => setFilter("orderNumber", v)}
                />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter
                  value={filters.groverContractNumber}
                  onChange={(v) => setFilter("groverContractNumber", v)}
                />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter value={filters.assignee} onChange={(v) => setFilter("assignee", v)} />
              </th>
              <th className="px-3 py-1.5">
                <div className="flex flex-col gap-1">
                  <SelectFilter
                    value={filters.emailPresence}
                    onChange={(v) => setFilter("emailPresence", v)}
                    options={[
                      { value: "set", label: "Has email" },
                      { value: "empty", label: "Has no email" },
                    ]}
                  />
                  <TextFilter
                    value={filters.email}
                    onChange={(v) => setFilter("email", v)}
                  />
                </div>
              </th>
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.employment}
                  onChange={(v) => setFilter("employment", v)}
                  options={Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </th>
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.active}
                  onChange={(v) => setFilter("active", v)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter value={filters.device} onChange={(v) => setFilter("device", v)} />
              </th>
              <th className="px-3 py-1.5">
                <MultiSelectFilter
                  values={filters.category}
                  onChange={(v) => setFilter("category", v)}
                  options={DEVICE_CATEGORIES.map((value) => ({
                    value,
                    label: DEVICE_CATEGORY_LABEL[value],
                  }))}
                />
              </th>
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.origin}
                  onChange={(v) => setFilter("origin", v)}
                  options={Object.entries(DEVICE_ORIGIN_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </th>
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.ownership}
                  onChange={(v) => setFilter("ownership", v)}
                  options={Object.entries(OWNERSHIP_STATUS_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </th>
              <th className="px-3 py-1.5" />
              <th className="px-3 py-1.5" />
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.enrolledAt}
                  onChange={(v) => setFilter("enrolledAt", v)}
                  options={[
                    { value: "set", label: "Has date" },
                    { value: "empty", label: "Has no date" },
                  ]}
                />
              </th>
              <th className="px-3 py-1.5">
                <SelectFilter
                  value={filters.status}
                  onChange={(v) => setFilter("status", v)}
                  options={Object.entries(ENROLLMENT_STATUS_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter value={filters.asana} onChange={(v) => setFilter("asana", v)} />
              </th>
              <th className="px-3 py-1.5">
                <TextFilter value={filters.mailLog} onChange={(v) => setFilter("mailLog", v)} />
              </th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ device, currentAssignment }) => {
              const employeeInfo = resolveEmployeeInfo(currentAssignment, employeesByName);
              const asanaTasks = parseAsanaTasks(device.asana_tasks);
              const mailLogEntries = parseMailLog(device.mail_log);
              return (
              <tr
                key={device.id}
                className="border-b border-border/60 transition hover:bg-accent/5"
              >
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    title="Edit serial number"
                    className="text-left text-accent hover:underline"
                    onClick={() =>
                      setModal({
                        type: "editSerial",
                        deviceId: device.id,
                        deviceName: device.device_name,
                        currentSerialNumber: device.serial_number,
                        amazonOrderNumber: device.amazon_order_number,
                      })
                    }
                  >
                    {device.serial_number ?? "—"}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {device.amazon_order_number ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {device.grover_contract_number ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {currentAssignment?.user_name || currentAssignment?.user_email ? (
                    <span className="text-foreground">
                      {currentAssignment.user_name ?? "—"}
                    </span>
                  ) : (
                    <span className="inline-block border border-border bg-surface px-2 py-0.5 text-xs text-muted">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">
                  {resolveEmail(currentAssignment, employeesByName) ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted">
                  {employeeInfo?.employment_type
                    ? EMPLOYMENT_TYPE_LABEL[employeeInfo.employment_type]
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {employeeInfo ? (
                    <span
                      className={
                        employeeInfo.active
                          ? "text-emerald-300"
                          : "text-muted"
                      }
                    >
                      {employeeInfo.active ? "Active" : "Inactive"}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-foreground">{device.device_name}</td>
                <td className="px-3 py-2 text-muted">
                  {DEVICE_CATEGORY_LABEL[device.category]}
                </td>
                <td className="px-3 py-2 text-muted">
                  {device.origin ? DEVICE_ORIGIN_LABEL[device.origin] : "—"}
                </td>
                <td className="px-3 py-2 text-muted">
                  {device.ownership_status
                    ? OWNERSHIP_STATUS_LABEL[device.ownership_status]
                    : "—"}
                </td>
                <td className="px-3 py-2 text-muted">{formatDevicePrice(device)}</td>
                <td className="px-3 py-2 text-muted">
                  {formatDate(device.order_date)}
                </td>
                <td className="px-3 py-2 text-muted">
                  {formatDate(device.enrolled_at)}
                </td>
                <td className="px-3 py-2">
                  <button
                    title="Edit enrollment"
                    onClick={() =>
                      setModal({
                        type: "enrollment",
                        deviceId: device.id,
                        deviceName: device.device_name,
                        status: device.enrollment_status,
                        enrolledAt: device.enrolled_at,
                      })
                    }
                  >
                    <StatusBadge status={device.enrollment_status} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[10rem] flex-col gap-1">
                    {asanaTasks.length > 0 ? (
                      asanaTasks.map((task, index) => (
                        <div key={`${task.url}-${index}`}>
                          {task.url ? (
                            <a
                              href={task.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              {task.title || task.url}
                            </a>
                          ) : (
                            <span className="text-foreground">{task.title}</span>
                          )}
                          {task.description && (
                            <div className="max-w-[14rem] truncate text-xs text-muted" title={task.description}>
                              {task.description}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    <button
                      className="w-fit text-xs text-muted hover:text-accent hover:underline"
                      onClick={() =>
                        setModal({
                          type: "editAsana",
                          deviceId: device.id,
                          deviceName: device.device_name,
                          tasks: asanaTasks,
                        })
                      }
                    >
                      {asanaTasks.length > 0 ? "Edit" : "Add"}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[12rem] flex-col gap-1.5">
                    {mailLogEntries.length > 0 ? (
                      mailLogEntries.map((entry, index) => (
                        <div key={`${entry.mail_link}-${index}`}>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="border border-border px-1.5 py-0.5 text-muted">
                              {MAIL_LOG_LABEL_TEXT[entry.label]}
                            </span>
                            {entry.recipient && (
                              <span className="text-foreground">{entry.recipient}</span>
                            )}
                          </div>
                          {entry.mail_link && (
                            <a
                              href={entry.mail_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              Open mail
                            </a>
                          )}
                          {entry.description && (
                            <div className="max-w-[14rem] truncate text-xs text-muted" title={entry.description}>
                              {entry.description}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    <button
                      className="w-fit text-xs text-muted hover:text-accent hover:underline"
                      onClick={() =>
                        setModal({
                          type: "editMailLog",
                          deviceId: device.id,
                          deviceName: device.device_name,
                          entries: mailLogEntries,
                        })
                      }
                    >
                      {mailLogEntries.length > 0 ? "Edit" : "Add"}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-3 text-xs">
                    <button
                      className="text-accent hover:underline"
                      onClick={() =>
                        setModal({
                          type: "reassign",
                          deviceId: device.id,
                          deviceName: device.device_name,
                        })
                      }
                    >
                      Reassign
                    </button>
                    <button
                      className="text-muted hover:text-accent hover:underline"
                      onClick={() =>
                        setModal({
                          type: "history",
                          deviceId: device.id,
                          deviceName: device.device_name,
                        })
                      }
                    >
                      History
                    </button>
                    <button
                      className="text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={isDeleting && deletingId === device.id}
                      onClick={() => handleDeleteDevice(device.id, device.device_name)}
                    >
                      {isDeleting && deletingId === device.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={18} className="px-3 py-8 text-center text-muted">
                  {hasActiveFilters
                    ? "No devices match the current filters."
                    : "No devices yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === "add" && (
        <AddDeviceModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "import-returned" && (
        <ImportReturnedModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "import-mail-log" && (
        <ImportMailLogModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "import" && (
        <ImportModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "duplicates" && (
        <PossibleDuplicatesModal rows={rows} onClose={() => setModal(null)} />
      )}
      {modal?.type === "editSerial" && (
        <EditSerialModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          currentSerialNumber={modal.currentSerialNumber}
          amazonOrderNumber={modal.amazonOrderNumber}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "editAsana" && (
        <EditAsanaModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          currentTasks={modal.tasks}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "editMailLog" && (
        <EditMailLogModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          currentEntries={modal.entries}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "reassign" && (
        <ReassignModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "history" && (
        <HistoryModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          employeesByName={employeesByName}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "enrollment" && (
        <EditEnrollmentModal
          deviceId={modal.deviceId}
          deviceName={modal.deviceName}
          currentStatus={modal.status}
          currentEnrolledAt={modal.enrolledAt}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
