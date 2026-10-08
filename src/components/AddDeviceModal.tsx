"use client";

import { useActionState, useEffect } from "react";
import { addDevice } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { DEVICE_ORIGIN_LABEL } from "@/lib/format";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

export function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    addDevice,
    initialActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  return (
    <Modal title="Add device" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted">
            Serial number
          </label>
          <input
            name="serial_number"
            required
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Device name
          </label>
          <input name="device_name" required className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Origin
          </label>
          <select name="origin" className={inputClass} defaultValue="">
            <option value="">—</option>
            {Object.entries(DEVICE_ORIGIN_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Order date
          </label>
          <input type="date" name="order_date" className={inputClass} />
        </div>
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
            {pending ? "Adding…" : "Add device"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
