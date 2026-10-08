"use client";

import { useState, useTransition } from "react";
import { importDevices } from "@/app/dashboard/actions";
import { parseSpreadsheet } from "@/app/dashboard/parse-spreadsheet";
import {
  buildImportDigest,
  normalizeAndValidateRows,
  parseJsonRows,
  type ImportDigest,
  type ImportRowResult,
} from "@/lib/import";
import { Modal } from "./Modal";

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [digest, setDigest] = useState<ImportDigest | null>(null);
  const [imported, setImported] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, startImport] = useTransition();
  const [importSourceOption, setImportSourceOption] = useState("");
  const [importSourceCustom, setImportSourceCustom] = useState("");
  const importSource =
    importSourceOption === "other" ? importSourceCustom : importSourceOption;

  async function handleFile(file: File) {
    setFileError(null);
    setImportError(null);
    setResults(null);
    setDigest(null);
    setImported(false);
    setIsParsing(true);

    try {
      const isJson = file.name.toLowerCase().endsWith(".json");
      let rawRows: ReturnType<typeof parseJsonRows>;
      if (isJson) {
        rawRows = parseJsonRows(await file.text());
      } else {
        const formData = new FormData();
        formData.set("file", file);
        const result = await parseSpreadsheet(formData);
        if (result.error || !result.rows) {
          throw new Error(result.error ?? "Could not read this file.");
        }
        rawRows = result.rows;
      }

      if (rawRows.length === 0) {
        setFileError("The file has no data rows.");
      } else {
        const next = normalizeAndValidateRows(rawRows);
        setResults(next);
        setDigest(buildImportDigest(rawRows, next));
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read this file.");
    } finally {
      setIsParsing(false);
    }
  }

  const hasErrors = results?.some((result) => result.errors.length > 0) ?? true;
  const canConfirm = !!results && results.length > 0 && !hasErrors;
  const emptyCount = results?.filter((result) => result.isEmpty).length ?? 0;

  function handleRemoveEmpty() {
    setResults((prev) => prev?.filter((result) => !result.isEmpty) ?? null);
    setDigest((prev) =>
      prev
        ? {
            ...prev,
            counts: {
              ...prev.counts,
              rows: prev.counts.rows - prev.counts.empty,
              empty: 0,
            },
          }
        : null,
    );
  }

  function handleConfirm() {
    if (!results) return;
    const rows = results.map((result) => result.row!);
    startImport(async () => {
      const state = await importDevices(rows, importSource || undefined);
      if (state.status === "error") {
        setImportError(state.message);
      } else {
        setImported(true);
      }
    });
  }

  return (
    <Modal
      title={imported ? "Import complete" : "Import devices"}
      onClose={onClose}
      wide
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {imported && digest ? (
          <>
            <p className="text-sm text-foreground">
              Imported {digest.counts.imported} device
              {digest.counts.imported === 1 ? "" : "s"}.
            </p>
            <DigestPanel digest={digest} done />
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
              Upload a Deeploi MDM export, Amazon/Grover JSON, or any .xlsx /
              .json with serial_number (or amazon_order_number) and a device
              name. After the file is read, a digest shows exactly which
              columns were mapped, which were ignored, and how values like
              Device Type and Enrollment Status were interpreted.
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

            {digest && <DigestPanel digest={digest} />}

            {results && (
              <div className="max-h-72 overflow-y-auto border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-accent">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Serial / Order #</th>
                      <th className="px-3 py-2 font-medium">Device</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result.rowNumber} className="border-b border-border/60">
                        <td className="px-3 py-2 text-muted">{result.rowNumber}</td>
                        <td className="px-3 py-2 font-mono">
                          {result.row?.serial_number ??
                            result.row?.amazon_order_number ??
                            "—"}
                        </td>
                        <td className="px-3 py-2">{result.row?.device_name ?? "—"}</td>
                        <td className="px-3 py-2">{result.row?.owner_name ?? "—"}</td>
                        <td className="px-3 py-2">
                          {result.isEmpty ? (
                            <span className="text-muted">Empty row</span>
                          ) : result.errors.length === 0 ? (
                            <span className="text-emerald-300">OK</span>
                          ) : (
                            <span className="text-red-400">
                              {result.errors.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {emptyCount > 0 && (
              <div className="flex items-center justify-between border border-border bg-surface px-3 py-2 text-sm text-muted">
                <span>
                  {emptyCount} empty row{emptyCount === 1 ? "" : "s"} detected.
                </span>
                <button
                  type="button"
                  onClick={handleRemoveEmpty}
                  className="text-accent hover:underline"
                >
                  Remove empty entries
                </button>
              </div>
            )}

            {hasErrors && results && (
              <p className="text-sm text-amber-300">
                Fix the highlighted rows in the source file and re-upload — every
                row must be valid before importing.
              </p>
            )}
            {importError && <p className="text-sm text-red-400">{importError}</p>}

            {canConfirm && (
              <div>
                <label className="block text-xs font-medium text-muted">
                  Import source
                </label>
                <select
                  value={importSourceOption}
                  onChange={(e) => setImportSourceOption(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Optional</option>
                  <option value="Amazon">Amazon</option>
                  <option value="Grover">Grover</option>
                  <option value="Deeploi">Deeploi</option>
                  <option value="Apple Leasing">Apple Leasing</option>
                  <option value="other">Other</option>
                </select>
                {importSourceOption === "other" && (
                  <input
                    type="text"
                    value={importSourceCustom}
                    onChange={(e) => setImportSourceCustom(e.target.value)}
                    placeholder="Describe the source"
                    autoFocus
                    className="mt-2 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                )}
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
                {isImporting ? "Importing…" : `Confirm import (${results?.length ?? 0})`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function DigestPanel({ digest, done = false }: { digest: ImportDigest; done?: boolean }) {
  return (
    <div className="space-y-4 border border-border bg-background px-3 py-3">
      <p className="text-sm text-foreground">
        {done ? "Imported" : "Ready to import"} {digest.counts.imported} of{" "}
        {digest.counts.rows} rows
        {digest.counts.empty > 0 ? ` · ${digest.counts.empty} empty` : ""}
        {digest.counts.errors > 0 ? ` · ${digest.counts.errors} with errors` : ""}
      </p>

      <div>
        <p className="mb-1 text-sm text-muted">Mapped columns</p>
        <ul className="divide-y divide-border/60 border border-border">
          {digest.mapped.map((item) => (
            <li
              key={item.source}
              className="flex items-baseline justify-between gap-4 px-2 py-1.5 text-xs"
            >
              <span className="font-mono text-foreground">{item.source}</span>
              <span className="text-muted">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {digest.ignored.length > 0 && (
        <div>
          <p className="mb-1 text-sm text-muted">Ignored columns</p>
          <p className="text-xs text-muted">{digest.ignored.join(" · ")}</p>
        </div>
      )}

      {digest.valueNotes.length > 0 && (
        <div>
          <p className="mb-1 text-sm text-muted">How values were read</p>
          <ul className="space-y-1 text-xs">
            {digest.valueNotes.map((note) => (
              <li key={note.label}>
                <span className="text-foreground">{note.label}</span>
                <span className="text-muted"> — {note.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {digest.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {digest.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
