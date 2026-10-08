import type { MailLogEntry, MailLogLabel } from "@/types/database.types";

// The only two labels for now -- see 0027_mail_log.sql. Add new ones here
// and in the migration's check when they're needed.
export const MAIL_LOG_LABELS: MailLogLabel[] = ["enrollment_reminder", "return_request"];

export const MAIL_LOG_LABEL_TEXT: Record<MailLogLabel, string> = {
  enrollment_reminder: "Enrollment reminder",
  return_request: "Return request",
};

function isMailLogLabel(value: unknown): value is MailLogLabel {
  return typeof value === "string" && (MAIL_LOG_LABELS as string[]).includes(value);
}

export function parseMailLog(value: unknown): MailLogEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: MailLogEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = isMailLogLabel(record.label) ? record.label : null;
    const mailLink = typeof record.mail_link === "string" ? record.mail_link.trim() : "";
    if (!label && !mailLink) continue;
    entries.push({
      label: label ?? "enrollment_reminder",
      recipient:
        typeof record.recipient === "string" && record.recipient.trim() !== ""
          ? record.recipient.trim()
          : null,
      mail_link: mailLink,
      description:
        typeof record.description === "string" && record.description.trim() !== ""
          ? record.description.trim()
          : null,
      sent_at: typeof record.sent_at === "string" && record.sent_at.trim() !== "" ? record.sent_at : null,
      message_id:
        typeof record.message_id === "string" && record.message_id.trim() !== ""
          ? record.message_id.trim()
          : null,
    });
  }
  return entries;
}

export function validateMailLog(entries: MailLogEntry[]): string | null {
  for (const entry of entries) {
    if (!MAIL_LOG_LABELS.includes(entry.label)) {
      return `Unknown mail log label "${entry.label}".`;
    }
    if (!entry.mail_link) return "Each mail log entry needs a link to the mail.";
    try {
      const parsed = new URL(entry.mail_link);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return `Invalid mail link: ${entry.mail_link}`;
      }
    } catch {
      return `Invalid mail link: ${entry.mail_link}`;
    }
  }
  return null;
}
