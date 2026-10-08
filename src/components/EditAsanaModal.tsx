"use client";

import { useActionState, useEffect, useState } from "react";
import { updateAsanaTasks } from "@/app/dashboard/actions";
import { initialActionState } from "@/lib/action-state";
import { parseAsanaTasks } from "@/lib/asana";
import type { AsanaTask } from "@/types/database.types";
import { Modal } from "./Modal";

const inputClass =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-accent focus:glow-sm focus:outline-none";

type DraftTask = {
  title: string;
  url: string;
  description: string;
};

function toDraft(tasks: AsanaTask[]): DraftTask[] {
  const drafts = parseAsanaTasks(tasks).map((task) => ({
    title: task.title,
    url: task.url,
    description: task.description ?? "",
  }));
  return drafts.length > 0 ? drafts : [{ title: "", url: "", description: "" }];
}

export function EditAsanaModal({
  deviceId,
  deviceName,
  currentTasks,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  currentTasks: AsanaTask[];
  onClose: () => void;
}) {
  const boundAction = updateAsanaTasks.bind(null, deviceId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialActionState,
  );
  const [tasks, setTasks] = useState<DraftTask[]>(() => toDraft(currentTasks));

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state, onClose]);

  function updateTask(index: number, patch: Partial<DraftTask>) {
    setTasks((previous) =>
      previous.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    );
  }

  const payload = JSON.stringify(
    tasks
      .map((task) => ({
        title: task.title.trim(),
        url: task.url.trim(),
        description: task.description.trim() || null,
      }))
      .filter((task) => task.title || task.url || task.description),
  );

  return (
    <Modal title={`Asana — ${deviceName}`} onClose={onClose} wide>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="asana_tasks" value={payload} />
        <p className="text-xs text-muted">
          Link the Asana tasks that belong to this device. Title and URL are
          required for each task; description is optional.
        </p>
        {tasks.map((task, index) => (
          <div key={index} className="space-y-2 border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Task {index + 1}</p>
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setTasks((previous) => previous.filter((_, i) => i !== index))
                  }
                  className="text-xs text-muted hover:text-accent"
                >
                  Remove
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Title</label>
              <input
                value={task.title}
                onChange={(event) => updateTask(index, { title: event.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">URL</label>
              <input
                type="url"
                value={task.url}
                onChange={(event) => updateTask(index, { url: event.target.value })}
                placeholder="https://app.asana.com/…"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Description
              </label>
              <textarea
                value={task.description}
                onChange={(event) =>
                  updateTask(index, { description: event.target.value })
                }
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setTasks((previous) => [
              ...previous,
              { title: "", url: "", description: "" },
            ])
          }
          className="text-sm text-accent hover:underline"
        >
          + Add task
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
