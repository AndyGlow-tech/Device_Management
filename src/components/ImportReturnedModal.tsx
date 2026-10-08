"use client";

import { useState, useTransition } from "react";
import {
  importReturnedDevices,
  type ReturnedOutcome,
  type ReturnedPreviewItem,
} from "@/app/dashboard/actions";
import { parseSpreadsheet } from "@/app/dashboard/parse-spreadsheet";
import { parseJsonRows, type RawImportRow } from "@/lib/import";
import {
  buildReturnedDigest,
  normalizeReturnedRows,
  type ReturnedRow,
  type ReturnedRowResult,
} from "@/lib/import-returned";
import { Modal } from "./Modal";

const OUTCOME_LABEL: Record<ReturnedOutcome, { text: string; className: string }> = {
  returned: { text: "Will be marked returned", className: "text-emerald-300" },
  already_returned: { text: "Already returned — skipped", className: "text-muted" },
  not_found: { text: "No device with this serial", className: "text-red-400" },
  ambiguous: { text: "Serial matches several devices", className: "text-red-400" },
};

type Line = {
  result: ReturnedRowResult;
  item: ReturnedPreviewItem | null;
};

export function ImportReturnedModal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [digest, setDigest] = useState<ReturnType<typeof buildReturnedDigest> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, startImport] = useTransition();
  const [importSource, setImportSource] = useState("");
  const [doneCount, setDoneCount] = useState<number | null>(null);

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

      const results = normalizeReturnedRows(rawRows);
      setDigest(buildReturnedDigest(rawRows));

      // Dry run against the database: tells us per serial whether it matches
      // exactly one device, is already returned, or can't be found.
      const toCheck = results.filter(
        (result): result is ReturnedRowResult & { row: ReturnedRow } =>
          !!result.row && !result.isDuplicate,
      );
      const preview = await importReturnedDevices(
        toCheck.map((result) => result.row),
        { dryRun: true },
      );
      if (preview.status === "error") throw new Error(preview.message);

      const itemByRow = new Map<number, ReturnedPreviewItem>();
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

  const toReturn = lines?.filter((line) => line.item?.outcome === "returned") ?? [];
  // Rows that can't be applied (unknown serial, ambiguous, invalid) are
  // skipped rather than blocking the batch: this import only updates existing
  // devices, so there is nothing to "fix" in the file for an unknown serial.
  const problemLines =
    lines?.filter(
      (line) =>
        line.result.errors.length > 0 ||
        line.item?.outcome === "not_found" ||
        line.item?.outcome === "ambiguous",
    ) ?? [];
  const canConfirm = !!lines && toReturn.length > 0;

  function handleConfirm() {
    startImport(async () => {
      const state = await importReturnedDevices(
        toReturn.map((line) => line.result.row!),
        { dryRun: false, importSource: importSource || undefined },
      );
      if (state.status === "error") {
        setImportError(state.message);
      } else {
        setDoneCount(state.items.filter((item) => item.outcome === "returned").length);
      }
    });
  }

  return (
    <Modal
      title={doneCount !== null ? "Import complete" : "Import returned devices"}
      onClose={onClose}
      wide
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {doneCount !== null ? (
          <>
            <p className="text-sm text-foreground">
              Marked {doneCount} device{doneCount === 1 ? "" : "s"} as returned.
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
            <p className="text-xs text-muted">
              Upload a mail export (.xlsx / .json) with a serial number per
              returned device. Optional columns: Message ID, Link, Date/time,
              Recipient, Asana link. A leading “S” on Grover serials is
              ignored when matching. Each device is unassigned, set to
              Returned, and the mail is stored as a reference in its history.
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
                      <th className="px-3 py-2 font-medium">Serial</th>
                      <th className="px-3 py-2 font-medium">Device</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(({ result, item }) => (
                      <tr key={result.rowNumber} className="border-b border-border/60">
                        <td className="px-3 py-2 text-muted">{result.rowNumber}</td>
                        <td className="px-3 py-2 font-mono">
                          {result.row?.serial_number ?? "—"}
                          {item?.matched_serial &&
                            item.matched_serial.toLowerCase() !==
                              result.row?.serial_number.toLowerCase() && (
                              <div className="text-xs text-muted">
                                → {item.matched_serial}
                              </div>
                            )}
                        </td>
                        <td className="px-3 py-2">
                          {item?.device_name ?? result.deviceLabel ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {result.errors.length > 0 ? (
                            <span className="text-red-400">{result.errors.join("; ")}</span>
                          ) : result.isDuplicate ? (
                            <span className="text-muted">
                              Further mail for the same serial — skipped
                            </span>
                          ) : item ? (
                            <span className={OUTCOME_LABEL[item.outcome].className}>
                              {OUTCOME_LABEL[item.outcome].text}
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
                red will be skipped — they match no device (or several) or are
                invalid. Everything else is imported.
              </p>
            )}
            {lines && problemLines.length === 0 && toReturn.length === 0 && (
              <p className="text-sm text-muted">Nothing to import — all devices are already returned.</p>
            )}
            {lines && problemLines.length > 0 && toReturn.length === 0 && (
              <p className="text-sm text-muted">Nothing to import — no row matches a device.</p>
            )}
            {importError && <p className="text-sm text-red-400">{importError}</p>}

            {canConfirm && (
              <div>
                <label className="block text-xs font-medium text-muted">
                  Import source (e.g. &quot;Grover return mails&quot;)
                </label>
                <input
                  type="text"
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
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
                type="button"
                disabled={!canConfirm || isImporting}
                onClick={handleConfirm}
                className="glow-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                {isImporting
                  ? "Importing…"
                  : `Confirm return (${toReturn.length})${problemLines.length > 0 ? ` · skip ${problemLines.length}` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
