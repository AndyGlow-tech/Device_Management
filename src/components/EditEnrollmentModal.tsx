"use client";

import { useActionState, useEffect } from "react";
import { updateEnrollment } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/format";
import type { EnrollmentStatus } from "@/types/database.types";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

export function EditEnrollmentModal({
  deviceId,
  deviceName,
  currentStatus,
  currentEnrolledAt,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  currentStatus: EnrollmentStatus;
  currentEnrolledAt: string | null;
  onClose: () => void;
}) {
  const boundAction = updateEnrollment.bind(null, deviceId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  return (
    <Modal title={`Enrollment — ${deviceName}`} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted">
            Enrollment status
          </label>
          <select
            name="enrollment_status"
            required
            defaultValue={currentStatus}
            className={inputClass}
          >
            {Object.entries(ENROLLMENT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Enrolled on
          </label>
          <input
            type="date"
            name="enrolled_at"
            defaultValue={currentEnrolledAt ?? ""}
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
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
