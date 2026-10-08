"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateAssignmentDescription } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/client";
import { EMPLOYMENT_TYPE_LABEL, formatDate } from "@/lib/format";
import type {
  DeviceAssignment,
  EmployeeInfo,
  EnrollmentStatus,
} from "@/types/database.types";
import { Modal } from "./Modal";

const inputClass =
  "w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

export function HistoryModal({
  deviceId,
  deviceName,
  employeesByName,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  employeesByName: Record<string, EmployeeInfo>;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<DeviceAssignment[] | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<EnrollmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("devices")
      .select("enrollment_status")
      .eq("id", deviceId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setDeviceStatus(data.enrollment_status);
      });

    supabase
      .from("device_assignments")
      .select("*")
      .eq("device_id", deviceId)
      .order("assigned_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setHistory(data);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // The history lists who held the device; what happened after the last
  // owner (returned / just unassigned) is shown as its own top row, with the
  // return mail attached to it rather than to the previous owner's period.
  const latest = history?.[0] ?? null;
  const latestIsReturnMarker =
    !!latest && !latest.user_name && !latest.user_email && !!latest.mail_message_id;
  const stateRow =
    history && latest && !history.some((e) => !e.unassigned_at) && !latestIsReturnMarker
      ? {
          label: deviceStatus === "returned" ? "Returned" : "Unassigned",
          date: latest.unassigned_at,
          changedBy: latest.changed_by,
          mailEntry:
            deviceStatus === "returned"
              ? (history.find((e) => e.mail_message_id) ?? null)
              : null,
        }
      : null;

  return (
    <Modal title={`History — ${deviceName}`} onClose={onClose} wide>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !history && (
        <p className="text-sm text-muted">Loading…</p>
      )}
      {!error && history && history.length === 0 && (
        <p className="text-sm text-muted">No assignments recorded.</p>
      )}
      {!error && history && history.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-accent">
              <th className="py-2 pr-4 font-medium">Owner</th>
              <th className="py-2 pr-4 font-medium">From</th>
              <th className="py-2 pr-4 font-medium">To</th>
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 font-medium">Changed by</th>
            </tr>
          </thead>
          <tbody>
            {stateRow && (
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4 align-top">
                  <span className="text-violet-300">{stateRow.label}</span>
                </td>
                <td className="py-2 pr-4 align-top">{formatDate(stateRow.date)}</td>
                <td className="py-2 pr-4 align-top">current</td>
                <td className="max-w-[18rem] py-2 pr-4 align-top">
                  {stateRow.label === "Returned" && (
                    <div className="text-foreground">Returned</div>
                  )}
                  {stateRow.mailEntry && <MailReference entry={stateRow.mailEntry} />}
                </td>
                <td className="py-2 align-top text-muted">
                  {stateRow.changedBy ?? "—"}
                </td>
              </tr>
            )}
            {history.map((entry) => {
              const employeeInfo = entry.user_name
                ? (employeesByName[entry.user_name] ?? null)
                : null;
              const employeeMeta = [
                employeeInfo?.employment_type
                  ? EMPLOYMENT_TYPE_LABEL[employeeInfo.employment_type]
                  : null,
                employeeInfo ? (employeeInfo.active ? "Active" : "Inactive") : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
              <tr key={entry.id} className="border-b border-border/60">
                <td className="py-2 pr-4">
                  {entry.user_name || entry.user_email ? (
                    <>
                      <div className="text-foreground">{entry.user_name ?? "—"}</div>
                      <div className="text-xs text-muted">
                        {entry.user_email ?? employeeInfo?.user_email ?? ""}
                      </div>
                      {employeeMeta && (
                        <div className="text-xs text-muted">{employeeMeta}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </td>
                <td className="py-2 pr-4">{formatDate(entry.assigned_at)}</td>
                <td className="py-2 pr-4">
                  {entry.unassigned_at ? formatDate(entry.unassigned_at) : "current"}
                </td>
                <td className="max-w-[18rem] py-2 pr-4 align-top">
                  <AssignmentDescription
                    assignmentId={entry.id}
                    description={entry.description}
                    onSaved={(description) =>
                      setHistory((current) =>
                        current?.map((item) =>
                          item.id === entry.id ? { ...item, description } : item,
                        ) ?? current,
                      )
                    }
                  />
                  {entry.id !== stateRow?.mailEntry?.id && (
                    <MailReference entry={entry} />
                  )}
                </td>
                <td className="py-2 text-muted">
                  {entry.changed_by ?? "—"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function MailReference({ entry }: { entry: DeviceAssignment }) {
  if (!entry.mail_link && !entry.mail_recipient) return null;
  return (
    <>
      {entry.mail_link && (
        <a
          href={entry.mail_link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-accent hover:underline"
        >
          Open mail ↗
        </a>
      )}
      {entry.mail_recipient && (
        <div className="text-xs text-muted">To: {entry.mail_recipient}</div>
      )}
    </>
  );
}

function AssignmentDescription({
  assignmentId,
  description,
  onSaved,
}: {
  assignmentId: string;
  description: string | null;
  onSaved: (description: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p
          className={`whitespace-pre-wrap break-words ${
            description ? "text-foreground" : "text-muted"
          }`}
        >
          {description ?? "—"}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-accent hover:underline"
        >
          {description ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <DescriptionForm
      key={description ?? ""}
      assignmentId={assignmentId}
      initialDescription={description}
      onCancel={() => setEditing(false)}
      onSaved={(next) => {
        onSaved(next);
        setEditing(false);
      }}
    />
  );
}

function DescriptionForm({
  assignmentId,
  initialDescription,
  onCancel,
  onSaved,
}: {
  assignmentId: string;
  initialDescription: string | null;
  onCancel: () => void;
  onSaved: (description: string | null) => void;
}) {
  const [value, setValue] = useState(initialDescription ?? "");
  const saved = useRef(false);
  const boundAction = updateAssignmentDescription.bind(null, assignmentId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.status !== "success" || saved.current) return;
    saved.current = true;
    onSaved(value.trim() === "" ? null : value.trim());
  }, [state, onSaved, value]);

  return (
    <form action={formAction} className="space-y-2">
      <label className="sr-only" htmlFor={`description-${assignmentId}`}>
        Description
      </label>
      <textarea
        id={`description-${assignmentId}`}
        name="description"
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Why this device moved…"
        autoFocus
        disabled={pending}
        className={inputClass}
      />
      {state.status === "error" && (
        <p className="text-sm text-red-400">{state.message}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="glow-sm bg-accent px-2 py-1 text-xs font-medium text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
