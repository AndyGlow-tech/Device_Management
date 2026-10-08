"use client";

import { useActionState, useEffect, useState } from "react";
import { updateMailLog } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { MAIL_LOG_LABELS, MAIL_LOG_LABEL_TEXT, parseMailLog } from "@/lib/mailLog";
import type { MailLogEntry, MailLogLabel } from "@/types/database.types";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

type DraftEntry = {
  label: MailLogLabel;
  recipient: string;
  mail_link: string;
  description: string;
  sent_at: string;
};

function toDraft(entries: MailLogEntry[]): DraftEntry[] {
  const drafts = parseMailLog(entries).map((entry) => ({
    label: entry.label,
    recipient: entry.recipient ?? "",
    mail_link: entry.mail_link,
    description: entry.description ?? "",
    sent_at: entry.sent_at ?? "",
  }));
  return drafts.length > 0
    ? drafts
    : [{ label: "enrollment_reminder" as MailLogLabel, recipient: "", mail_link: "", description: "", sent_at: "" }];
}

export function EditMailLogModal({
  deviceId,
  deviceName,
  currentEntries,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  currentEntries: MailLogEntry[];
  onClose: () => void;
}) {
  const boundAction = updateMailLog.bind(null, deviceId);
  const [state, formAction, pending] = useActionState(boundAction, initialActionState);
  const [entries, setEntries] = useState<DraftEntry[]>(() => toDraft(currentEntries));

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  function updateEntry(index: number, patch: Partial<DraftEntry>) {
    setEntries((previous) =>
      previous.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  // message_id is never set here -- that's only ever written by the bulk
  // import, so a manual entry can't accidentally collide with a future one.
  const payload = JSON.stringify(
    entries
      .map((entry) => ({
        label: entry.label,
        recipient: entry.recipient.trim() || null,
        mail_link: entry.mail_link.trim(),
        description: entry.description.trim() || null,
        sent_at: entry.sent_at.trim() || null,
        message_id: null,
      }))
      .filter((entry) => entry.mail_link || entry.recipient || entry.description),
  );

  return (
    <Modal title={`Mail log — ${deviceName}`} onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="mail_log" value={payload} />
        <p className="text-xs text-muted">
          Mails sent about this device (enrollment reminders, return
          requests). Label and mail link are required for each entry.
        </p>
        {entries.map((entry, index) => (
          <div key={index} className="space-y-2 border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Entry {index + 1}</p>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setEntries((previous) => previous.filter((_, i) => i !== index))
                  }
                  className="text-xs text-muted hover:text-accent"
                >
                  Remove
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Label</label>
              <select
                value={entry.label}
                onChange={(event) =>
                  updateEntry(index, { label: event.target.value as MailLogLabel })
                }
                className={inputClass}
              >
                {MAIL_LOG_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {MAIL_LOG_LABEL_TEXT[label]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Recipient</label>
              <input
                value={entry.recipient}
                onChange={(event) => updateEntry(index, { recipient: event.target.value })}
                placeholder="Who the mail was sent to"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Mail link</label>
              <input
                type="url"
                value={entry.mail_link}
                onChange={(event) => updateEntry(index, { mail_link: event.target.value })}
                placeholder="https://mail.google.com/mail/…"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Sent at</label>
              <input
                type="date"
                value={entry.sent_at}
                onChange={(event) => updateEntry(index, { sent_at: event.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Description</label>
              <textarea
                value={entry.description}
                onChange={(event) => updateEntry(index, { description: event.target.value })}
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setEntries((previous) => [
              ...previous,
              { label: "enrollment_reminder", recipient: "", mail_link: "", description: "", sent_at: "" },
            ])
          }
          className="text-sm text-accent hover:underline"
        >
          + Add entry
        </button>
        {state.status === "error" && (
          <p className="text-sm text-red-400">{state.message}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="glow-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
