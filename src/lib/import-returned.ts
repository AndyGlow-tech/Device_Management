import type { RawImportRow } from "@/lib/import";

// One row per returned device, as sent to import_returned_devices.
export type ReturnedRow = {
  serial_number: string;
  message_id: string | null;
  mail_link: string | null;
  mail_recipient: string | null;
  returned_at: string | null;
  asana_url: string | null;
  asana_title: string | null;
};

export type ReturnedRowResult = {
  rowNumber: number;
  row: ReturnedRow | null;
  errors: string[];
  // Extra mails for a serial that was already seen earlier in the file.
  isDuplicate: boolean;
  deviceLabel: string | null;
};

// Same convention as import.ts: canonical header plus aliases from the mail
// export, matched case-insensitively. "Recipient" is deliberately not mapped:
// in the Grover export it is the shared IT mailbox, not the person.
const FIELD_ALIASES = {
  serial_number: ["serial_number", "serial number", "serial"],
  message_id: ["message_id", "message id"],
  mail_link: ["mail_link", "mail-link", "mail link", "link"],
  returned_at: ["returned_at", "return date", "date/time (utc)", "date"],
  asana_url: ["asana_link", "asana-link", "asana link", "asana_url"],
  device_name: ["device_name", "device", "name"],
  recipient: ["recipient"],
} as const;

type Field = keyof typeof FIELD_ALIASES;

export const RETURNED_FIELD_LABELS: Record<Field, string> = {
  serial_number: "Serial number",
  message_id: "Mail message ID",
  mail_link: "Mail link",
  returned_at: "Return date",
  asana_url: "Asana link",
  device_name: "Device name (display only)",
  recipient: "Recipient (mailbox, used for the mail link)",
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

function toDate(value: string | null): { value: string | null; error?: string } {
  if (!value) return { value: null };
  // "2026-10-05 16:08:14" -> take the calendar date as written (UTC).
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

// The "Link" column of the Grover export is just "Open in Gmail" pointing at
// the Gmail inbox, not at the mail. Only trust a link that already targets a
// specific mail (has a #fragment); otherwise build one from the message ID.
function resolveMailLink(
  link: string | null,
  messageId: string | null,
  recipient: string | null,
): string | null {
  if (isUrl(link) && link.includes("#")) return link;
  if (!messageId) return isUrl(link) ? link : null;
  const account = recipient?.includes("@")
    ? `?authuser=${encodeURIComponent(recipient)}`
    : "";
  return `https://mail.google.com/mail/${account}#all/${encodeURIComponent(messageId)}`;
}

export function normalizeReturnedRows(
  rawRows: RawImportRow[],
): ReturnedRowResult[] {
  const seen = new Map<string, number>();

  return rawRows.map((raw, index) => {
    const errors: string[] = [];
    const serial = getField(raw, "serial_number");
    const messageId = getField(raw, "message_id");
    const returnedAt = toDate(getField(raw, "returned_at"));
    if (returnedAt.error) errors.push(`returned_at: ${returnedAt.error}`);
    const asanaUrl = getField(raw, "asana_url");
    if (asanaUrl && !isUrl(asanaUrl)) errors.push(`invalid Asana link "${asanaUrl}"`);
    if (!serial) errors.push("missing serial number");

    // The same return is often confirmed by several mails. Only the first one
    // per serial is imported -- later ones are shown but skipped.
    const key = serial?.toLowerCase() ?? null;
    const isDuplicate = key !== null && seen.has(key);
    if (key !== null && !isDuplicate) seen.set(key, index);

    const recipient = getField(raw, "recipient");

    const row: ReturnedRow | null =
      errors.length === 0 && serial
        ? {
            serial_number: serial,
            message_id: messageId,
            mail_link: resolveMailLink(
              getField(raw, "mail_link"),
              messageId,
              recipient,
            ),
            mail_recipient: recipient,
            returned_at: returnedAt.value,
            asana_url: asanaUrl,
            asana_title: asanaUrl ? "Device return" : null,
          }
        : null;

    return {
      rowNumber: index + 2,
      row,
      errors,
      isDuplicate,
      deviceLabel: getField(raw, "device_name"),
    };
  });
}

export function buildReturnedDigest(rawRows: RawImportRow[]): {
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
    if (field) mapped.push({ source, label: RETURNED_FIELD_LABELS[field] });
    else ignored.push(source);
  }
  return { mapped, ignored };
}
