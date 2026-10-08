"use client";

import { useState, useTransition } from "react";
import {
  importMailLog,
  type MailLogOutcome,
  type MailLogPreviewItem,
} from "@/app/dashboard/actions";
import { parseSpreadsheet } from "@/app/dashboard/parse-spreadsheet";
import {
  buildMailLogDigest,
  normalizeMailLogRows,
  type MailLogRow,
  type MailLogRowResult,
} from "@/lib/import-mail-log";
import { parseJsonRows, type RawImportRow } from "@/lib/import";
import { Modal } from "./Modal";

const MAIL_LOG_PROMPT = `I'm attaching a CSV export from our device dashboard (already filtered to the devices I care about). Each row has a Serial Number, Device Name, Assignee, and Email.

You have access to our Gmail. For each person in the CSV, search for mails we sent them about either of these two things:
- An enrollment reminder: asking them to register/enroll their device in Deeploi.
- A return request: asking them to send a device back (e.g. because they left, or the device is being renewed/replaced).

These mails do NOT contain a device serial number, only the person's name — leave the Serial Number column blank, matching happens by recipient name instead.

Create an Excel file (.xlsx) with ONE sheet and ONE row per mail found. Row 1 must contain exactly these headers:

Serial Number | Label | Recipient | Mail Link | Description | Sent At | Message ID

Fill the columns like this:
- Serial Number: leave blank.
- Label (required): exactly "Enrollment reminder" or "Return request" — no other values.
- Recipient (required): the person's name exactly as it appears in the input CSV's Assignee column — this is the only thing used to match the mail back to their device(s), so don't paraphrase or abbreviate it.
- Mail Link (required): direct link to the mail in Gmail (https://mail.google.com/mail/#all/<message id>).
- Description: one short sentence summarizing the mail (e.g. "Reminder sent after no response to the first one").
- Sent At: the date the mail was sent, formatted YYYY-MM-DD.
- Message ID: the Gmail message ID.

Rules:
- Only include a mail you're confident matches one of the two categories above and one of the people in the CSV. If a person has several matching mails, add a row for each.
- If a mail mentions returning or enrolling several devices at once (e.g. "Rücksendung der Geräte"), that's fine — one row for it still gets applied to everything currently assigned to that person.
- If a row's person has no matching mail, skip them; don't add an empty row.
- Do not add extra columns, header rows, totals or formatting.
- When you're done, tell me how many of the input people you found a match for, and list any you skipped because you weren't sure.`;

const OUTCOME_LABEL: Record<MailLogOutcome, { text: string; className: string }> = {
  added: { text: "Will be added", className: "text-emerald-300" },
  duplicate: { text: "Already logged on every matched device — skipped", className: "text-muted" },
  not_found: { text: "No device currently assigned to this serial/name", className: "text-red-400" },
  invalid_label: { text: "Unknown label", className: "text-red-400" },
  invalid: { text: "Missing mail link, or both serial and recipient", className: "text-red-400" },
};

type Line = {
  result: MailLogRowResult;
  item: MailLogPreviewItem | null;
};

export function ImportMailLogModal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [digest, setDigest] = useState<ReturnType<typeof buildMailLogDigest> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, startImport] = useTransition();
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(MAIL_LOG_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleFile(file: File) {
    setFileError(null);
    setImportError(null);
    setLines(null);
    setDigest(null);
    setDoneCount(null);
    setIsParsing(true);

    try {
      let rawRows: RawImportRow[];
      if (file.name.toLowerCase().endsWith(".json")) {
        rawRows = parseJsonRows(await file.text());
      } else {
        const formData = new FormData();
        formData.set("file", file);
        const parsed = await parseSpreadsheet(formData);
        if (parsed.error || !parsed.rows) {
          throw new Error(parsed.error ?? "Could not read this file.");
        }
        rawRows = parsed.rows;
      }
      if (rawRows.length === 0) throw new Error("The file has no data rows.");

      const results = normalizeMailLogRows(rawRows);
      setDigest(buildMailLogDigest(rawRows));

      // Dry run: tells us per row whether it matches exactly one device and
      // whether it's already in that device's mail log.
      const toCheck = results.filter(
        (result): result is MailLogRowResult & { row: MailLogRow } => !!result.row,
      );
      const preview = await importMailLog(
        toCheck.map((result) => result.row),
        { dryRun: true },
      );
      if (preview.status === "error") throw new Error(preview.message);

      const itemByRow = new Map<number, MailLogPreviewItem>();
      toCheck.forEach((result, i) => itemByRow.set(result.rowNumber, preview.items[i]));
      setLines(
        results.map((result) => ({
          result,
          item: itemByRow.get(result.rowNumber) ?? null,
        })),
      );
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read this file.");
    } finally {
      setIsParsing(false);
    }
  }

  const toAdd = lines?.filter((line) => line.item?.outcome === "added") ?? [];
  const totalDevicesToAdd = toAdd.reduce((sum, line) => sum + (line.item?.added_count ?? 0), 0);
  const problemLines =
    lines?.filter(
      (line) =>
        line.result.errors.length > 0 ||
        line.item?.outcome === "not_found" ||
        line.item?.outcome === "invalid_label" ||
        line.item?.outcome === "invalid",
    ) ?? [];
  const canConfirm = !!lines && toAdd.length > 0;

  function handleConfirm() {
    startImport(async () => {
      const state = await importMailLog(
        toAdd.map((line) => line.result.row!),
        { dryRun: false },
      );
      if (state.status === "error") {
        setImportError(state.message);
      } else {
        setDoneCount(state.items.reduce((sum, item) => sum + item.added_count, 0));
      }
    });
  }

  return (
    <Modal
      title={doneCount !== null ? "Import complete" : "Import mail log"}
      onClose={onClose}
      wide
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {doneCount !== null ? (
          <>
            <p className="text-sm text-foreground">
              Added {doneCount} mail log entr{doneCount === 1 ? "y" : "ies"}.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="glow-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted">
                Filter the dashboard to the devices you care about, click
                “Download filtered”, then give that file to Claude with the
                prompt below (with Gmail access). It checks correspondence
                and writes back the spreadsheet to upload here.
              </p>
              <div className="mt-2 mb-1.5 flex items-center justify-between">
                <span className="text-xs text-muted">Prompt</span>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto border border-border bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {MAIL_LOG_PROMPT}
              </pre>
            </div>

            <p className="text-xs text-muted">
              Then upload the spreadsheet Claude wrote back (.xlsx / .json)
              here: one row per mail, with Label (Enrollment reminder /
              Return request), Recipient, Mail Link, Description, and
              optionally Sent At and Message ID. A row is matched to a
              device by Serial Number if given, otherwise by Recipient
              against whoever currently has a device assigned — applied to
              every device they currently have. This only adds new entries
              — it never edits or removes one already in a device&apos;s
              mail log.
            </p>

            <input
              type="file"
              accept=".xlsx,.xls,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="block w-full text-sm text-foreground file:mr-3 file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />

            {isParsing && <p className="text-sm text-muted">Reading file…</p>}
            {fileError && <p className="text-sm text-red-400">{fileError}</p>}

            {digest && (
              <div className="space-y-2 border border-border bg-background px-3 py-3 text-xs">
                <p className="text-sm text-muted">Mapped columns</p>
                <ul className="divide-y divide-border/60 border border-border">
                  {digest.mapped.map((item) => (
                    <li key={item.source} className="flex justify-between gap-4 px-2 py-1.5">
                      <span className="font-mono text-foreground">{item.source}</span>
                      <span className="text-muted">{item.label}</span>
                    </li>
                  ))}
                </ul>
                {digest.ignored.length > 0 && (
                  <p className="text-muted">Ignored: {digest.ignored.join(" · ")}</p>
                )}
              </div>
            )}

            {lines && (
              <div className="max-h-72 overflow-y-auto border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-accent">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Matched by</th>
                      <th className="px-3 py-2 font-medium">Device(s)</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(({ result, item }) => (
                      <tr key={result.rowNumber} className="border-b border-border/60">
                        <td className="px-3 py-2 text-muted">{result.rowNumber}</td>
                        <td className="px-3 py-2 font-mono">
                          {result.row?.serial_number ?? result.row?.recipient ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {item?.device_names && item.device_names.length > 0
                            ? item.device_names.join(", ")
                            : (result.deviceLabel ?? "—")}
                        </td>
                        <td className="px-3 py-2">
                          {result.errors.length > 0 ? (
                            <span className="text-red-400">{result.errors.join("; ")}</span>
                          ) : item ? (
                            <span className={OUTCOME_LABEL[item.outcome]?.className ?? "text-muted"}>
                              {OUTCOME_LABEL[item.outcome]?.text ?? item.outcome}
                              {item.outcome === "added" && (item.matched_count ?? 0) > 1
                                ? ` (${item.added_count ?? "?"} of ${item.matched_count} devices)`
                                : ""}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {problemLines.length > 0 && (
              <p className="text-sm text-amber-300">
                {problemLines.length} row{problemLines.length === 1 ? "" : "s"} in
                red will be skipped — they match no device, use an unknown
                label, or are invalid. Everything else is imported.
              </p>
            )}
            {lines && problemLines.length === 0 && toAdd.length === 0 && (
              <p className="text-sm text-muted">Nothing to import — every entry is already logged.</p>
            )}
            {lines && problemLines.length > 0 && toAdd.length === 0 && (
              <p className="text-sm text-muted">Nothing to import — no row matches a device.</p>
            )}
            {importError && <p className="text-sm text-red-400">{importError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm || isImporting}
                onClick={handleConfirm}
                className="glow-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                {isImporting
                  ? "Importing…"
                  : `Confirm import (${totalDevicesToAdd} device${totalDevicesToAdd === 1 ? "" : "s"})${problemLines.length > 0 ? ` · skip ${problemLines.length}` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
