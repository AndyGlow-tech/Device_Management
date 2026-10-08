import type { AsanaTask } from "@/types/database.types";

export function parseAsanaTasks(value: unknown): AsanaTask[] {
  if (!Array.isArray(value)) return [];
  const tasks: AsanaTask[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const description =
      typeof record.description === "string" && record.description.trim() !== ""
        ? record.description.trim()
        : null;
    if (!title && !url && !description) continue;
    tasks.push({ title, url, description });
  }
  return tasks;
}

export function validateAsanaTasks(tasks: AsanaTask[]): string | null {
  for (const task of tasks) {
    if (!task.title) return "Each Asana task needs a title.";
    if (!task.url) return "Each Asana task needs a URL.";
    try {
      const parsed = new URL(task.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return `Invalid Asana URL: ${task.url}`;
      }
    } catch {
      return `Invalid Asana URL: ${task.url}`;
    }
  }
  return null;
}
