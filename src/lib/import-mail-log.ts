import type { RawImportRow } from "@/lib/import";
import { MAIL_LOG_LABEL_TEXT, MAIL_LOG_LABELS } from "@/lib/mailLog";
import type { MailLogLabel } from "@/types/database.types";

// One row per mail, as sent to import_mail_log. Matched by serial_number
// when given one; otherwise by recipient against whoever currently has a
// device assigned (these mails -- enrollment/return reminders -- never
// carry a device serial, only the person's name). At least one of the two
// is required.
export type MailLogRow = {
  serial_number: string | null;
  label: MailLogLabel;
  recipient: string | null;
  mail_link: string;
  description: string | null;
  sent_at: string | null;
  message_id: string | null;
};

export type MailLogRowResult = {
  rowNumber: number;
  row: MailLogRow | null;
  errors: string[];
  deviceLabel: string | null;
};

const FIELD_ALIASES = {
  serial_number: ["serial_number", "serial number", "serial"],
  label: ["label", "type", "category"],
  recipient: ["recipient", "to", "sent to", "person"],
  mail_link: ["mail_link", "mail-link", "mail link", "link"],
  description: ["description", "note", "notes"],
  sent_at: ["sent_at", "sent at", "date/time (utc)", "date"],
  message_id: ["message_id", "message id"],
  device_name: ["device_name", "device", "name"],
} as const;

type Field = keyof typeof FIELD_ALIASES;

export const MAIL_LOG_FIELD_LABELS: Record<Field, string> = {
  serial_number: "Serial number",
  label: "Label",
  recipient: "Recipient",
  mail_link: "Mail link",
  description: "Description",
  sent_at: "Sent at",
  message_id: "Mail message ID",
  device_name: "Device name (display only)",
};

const LABEL_ALIASES: Record<string, MailLogLabel> = {
  enrollment_reminder: "enrollment_reminder",
  "enrollment reminder": "enrollment_reminder",
  return_request: "return_request",
  "return request": "return_request",
};

function fieldForColumn(column: string): Field | null {
  const needle = column.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if ((aliases as readonly string[]).includes(needle)) return field as Field;
  }
  return null;
}

function getField(row: RawImportRow, field: Field): string | null {
  const keys = Object.keys(row);
  for (const alias of FIELD_ALIASES[field]) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias);
    if (!key) continue;
    const value = row[key];
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str !== "") return str;
  }
  return null;
}

function toLabel(value: string | null): { value: MailLogLabel | null; error?: string } {
  if (!value) return { value: null, error: "missing label" };
  const resolved = LABEL_ALIASES[value.trim().toLowerCase()];
  if (!resolved) {
    const allowed = MAIL_LOG_LABELS.map((label) => MAIL_LOG_LABEL_TEXT[label]).join(" / ");
    return { value: null, error: `unknown label "${value}" (expected ${allowed})` };
  }
  return { value: resolved };
}

function toDate(value: string | null): { value: string | null; error?: string } {
  if (!value) return { value: null };
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return { value: iso[1] };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { value: null, error: `invalid date "${value}"` };
  }
  return { value: date.toISOString().slice(0, 10) };
}

function isUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeMailLogRows(rawRows: RawImportRow[]): MailLogRowResult[] {
  return rawRows.map((raw, index) => {
    const errors: string[] = [];
    const serial = getField(raw, "serial_number");
    const recipient = getField(raw, "recipient");
    if (!serial && !recipient) errors.push("missing both serial number and recipient — need at least one to match a device");

    const label = toLabel(getField(raw, "label"));
    if (label.error) errors.push(label.error);

    const mailLink = getField(raw, "mail_link");
    if (!mailLink) errors.push("missing mail link");
    else if (!isUrl(mailLink)) errors.push(`invalid mail link "${mailLink}"`);

    const sentAt = toDate(getField(raw, "sent_at"));
    if (sentAt.error) errors.push(`sent_at: ${sentAt.error}`);

    const row: MailLogRow | null =
      errors.length === 0 && (serial || recipient) && label.value && mailLink
        ? {
            serial_number: serial,
            label: label.value,
            recipient,
            mail_link: mailLink,
            description: getField(raw, "description"),
            sent_at: sentAt.value,
            message_id: getField(raw, "message_id"),
          }
        : null;

    return {
      rowNumber: index + 2,
      row,
      errors,
      deviceLabel: getField(raw, "device_name"),
    };
  });
}

export function buildMailLogDigest(rawRows: RawImportRow[]): {
  mapped: { source: string; label: string }[];
  ignored: string[];
} {
  const columns = new Set<string>();
  for (const raw of rawRows) {
    for (const key of Object.keys(raw)) if (key.trim()) columns.add(key);
  }
  const mapped: { source: string; label: string }[] = [];
  const ignored: string[] = [];
  for (const source of [...columns].sort((a, b) => a.localeCompare(b))) {
    const field = fieldForColumn(source);
    if (field) mapped.push({ source, label: MAIL_LOG_FIELD_LABELS[field] });
    else ignored.push(source);
  }
  return { mapped, ignored };
}
