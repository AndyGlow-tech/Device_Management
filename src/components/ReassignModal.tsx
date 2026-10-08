"use client";

import { useActionState, useEffect } from "react";
import { reassignDevice } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

export function ReassignModal({
  deviceId,
  deviceName,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}) {
  const boundAction = reassignDevice.bind(null, deviceId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  return (
    <Modal title={`Reassign ${deviceName}`} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <p className="text-xs text-muted">
          Leave name and email blank to mark this device as unassigned.
        </p>
        <div>
          <label className="block text-xs font-medium text-muted">
            New owner name
          </label>
          <input name="user_name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            New owner email
          </label>
          <input type="email" name="user_email" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Effective date
          </label>
          <input
            type="date"
            name="assigned_at"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Why this device is moving…"
            className={inputClass}
          />
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
            {pending ? "Saving…" : "Reassign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
