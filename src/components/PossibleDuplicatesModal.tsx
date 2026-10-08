"use client";

import { useMemo, useState, useTransition } from "react";
import { mergeDevices } from "@/app/dashboard/actions";
import { DEVICE_ORIGIN_LABEL, formatDate } from "@/lib/format";
import type { DeviceRow } from "./DeviceTable";
import { Modal } from "./Modal";

type Candidate = {
  key: string;
  unreconciled: DeviceRow;
  match: DeviceRow;
};

// Amazon never exposes a real serial, so serial_number is only ever null
// for an unreconciled Amazon-sourced device -- that's what makes a row a
// "duplicate" candidate here, paired against any other device the same
// person currently holds in the same category (Laptop/Computer/Phone/Tablet) that *does*
// have a real serial. Always a suggestion -- merging is a manual click,
// never automatic.
function findCandidates(rows: DeviceRow[]): Candidate[] {
  const unreconciled = rows.filter(
    (row) => row.device.serial_number === null && row.currentAssignment?.user_name,
  );
  const candidates: Candidate[] = [];

  for (const a of unreconciled) {
    const category = a.device.category;
    const ownerName = a.currentAssignment!.user_name;
    for (const b of rows) {
      if (b.device.id === a.device.id) continue;
      if (b.device.serial_number === null) continue;
      if (b.currentAssignment?.user_name !== ownerName) continue;
      if (b.device.category !== category) continue;

      candidates.push({
        key: `${a.device.id}:${b.device.id}`,
        unreconciled: a,
        match: b,
      });
    }
  }

  return candidates;
}

export function PossibleDuplicatesModal({
  rows,
  onClose,
}: {
  rows: DeviceRow[];
  onClose: () => void;
}) {
  const candidates = useMemo(() => findCandidates(rows), [rows]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = candidates.filter((c) => !dismissed.has(c.key));

  function handleMerge(candidate: Candidate) {
    setError(null);
    setMergingKey(candidate.key);
    startTransition(async () => {
      const result = await mergeDevices(
        candidate.match.device.id,
        candidate.unreconciled.device.id,
      );
      if (result.status === "error") {
        setError(result.message);
      } else {
        setDismissed((prev) => new Set(prev).add(candidate.key));
      }
      setMergingKey(null);
    });
  }

  return (
    <Modal title="Possible duplicates" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Devices with no known serial number (Amazon-sourced, since Amazon
          never exposes one) matched against another device the same person
          currently holds in the same category. Nothing here is merged
          automatically — review each pair and confirm.
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {visible.length === 0 ? (
          <p className="text-sm text-muted">No possible duplicates found.</p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {visible.map((candidate) => (
              <div
                key={candidate.key}
                className="border border-border bg-surface p-3"
              >
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Unreconciled (would be removed)
                    </div>
                    <div className="mt-1 text-foreground">
                      {candidate.unreconciled.device.device_name}
                    </div>
                    <div className="text-xs text-muted">
                      {candidate.unreconciled.device.origin
                        ? DEVICE_ORIGIN_LABEL[candidate.unreconciled.device.origin]
                        : "—"}
                      {" · Order "}
                      {candidate.unreconciled.device.amazon_order_number ?? "—"}
                      {" · "}
                      {formatDate(candidate.unreconciled.device.order_date)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Keeps its identity
                    </div>
                    <div className="mt-1 text-foreground">
                      {candidate.match.device.device_name}
                    </div>
                    <div className="text-xs text-muted">
                      {candidate.match.device.origin
                        ? DEVICE_ORIGIN_LABEL[candidate.match.device.origin]
                        : "—"}
                      {" · "}
                      <span className="font-mono text-accent">
                        {candidate.match.device.serial_number}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    Both currently held by{" "}
                    {candidate.unreconciled.currentAssignment?.user_name}
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDismissed((prev) => new Set(prev).add(candidate.key))
                      }
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Not a match
                    </button>
                    <button
                      type="button"
                      disabled={isPending && mergingKey === candidate.key}
                      onClick={() => handleMerge(candidate)}
                      className="glow-sm bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-60"
                    >
                      {isPending && mergingKey === candidate.key
                        ? "Merging…"
                        : "Merge"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
