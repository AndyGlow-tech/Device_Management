"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { mergeDevices, updateSerialNumber } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

export function EditSerialModal({
  deviceId,
  deviceName,
  currentSerialNumber,
  amazonOrderNumber,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  currentSerialNumber: string | null;
  amazonOrderNumber: string | null;
  onClose: () => void;
}) {
  const boundAction = updateSerialNumber.bind(null, deviceId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialActionState,
  );
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isMerging, startMerge] = useTransition();

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  function handleMerge(conflictingDeviceId: string) {
    setMergeError(null);
    startMerge(async () => {
      const result = await mergeDevices(conflictingDeviceId, deviceId);
      if (result.status === "error") {
        setMergeError(result.message);
      } else {
        onClose();
      }
    });
  }

  return (
    <Modal title={`Serial number — ${deviceName}`} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        {amazonOrderNumber && (
          <p className="text-xs text-muted">
            This device has no known serial yet — Amazon order{" "}
            <span className="font-mono text-accent">{amazonOrderNumber}</span>{" "}
            is its only identity until you fill one in here.
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-muted">
            Serial number
          </label>
          <input
            name="serial_number"
            required
            defaultValue={currentSerialNumber ?? ""}
            className={`${inputClass} font-mono`}
          />
        </div>
        {state.status === "error" && (
          <p className="text-sm text-red-400">{state.message}</p>
        )}
        {state.status === "conflict" && (
          <div className="space-y-2 border border-amber-400/40 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-300">{state.message}</p>
            <p className="text-xs text-muted">
              This is probably the same physical device known under two
              entries — merge this one into the existing device instead of
              changing its serial number. History and assignments move over;
              this entry (
              {amazonOrderNumber ? `Amazon order ${amazonOrderNumber}` : deviceName}
              ) is removed.
            </p>
            {mergeError && <p className="text-sm text-red-400">{mergeError}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isMerging}
                onClick={() => handleMerge(state.conflictingDeviceId)}
                className="glow-sm bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-60"
              >
                {isMerging ? "Merging…" : "Merge into existing device"}
              </button>
            </div>
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
