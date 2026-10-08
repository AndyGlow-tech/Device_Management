"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { formatImportRecency } from "@/lib/format";
import type { LastImports } from "@/lib/lastImport";

const RETURN_MAIL_PROMPT = `You have access to our shared IT mailbox (Gmail). Find every mail from the last x days in which Grover confirms that a device has been successfully returned / received back. Ignore mails that only announce a return, send a return label, or remind us to send a device back. Only a confirmed, completed return counts. ASK ME HOW MANY DAYS TO CHECK.

Create an Excel file (.xlsx) with ONE sheet and ONE row per returned device. Row 1 must contain exactly these headers:

Serial Number | Device | Date/Time (UTC) | Message ID | Link | Recipient | Asana Link

Fill the columns like this:
- Serial Number (required): the device serial exactly as written in the mail. Keep a leading "S" if present, our import ignores it. If a mail lists several devices, create one row per device.
- Device: device name/model as written in the mail, e.g. "MacBook Pro 14".
- Date/Time (UTC): when the mail was received, formatted YYYY-MM-DD HH:MM:SS.
- Message ID: the Gmail message ID of the mail.
- Link: direct link to that mail in Gmail (https://mail.google.com/mail/#all/<message id>).
- Recipient: the mailbox address that received the mail.
- Asana Link: leave empty unless the mail itself contains an Asana URL.

Rules:
- Never invent or guess a serial number. If a mail confirms a return but has no serial number, do not add a row. List those mails in your reply instead (subject + date), so we can check them by hand.
- If several mails confirm the same serial, add all of them; the import keeps the first one per serial.
- Do not add extra columns, header rows, totals or formatting.
- When you are done, tell me how many mails you checked, how many rows are in the file and which mails you skipped and why.`;

type NodeId =
  | "amazon"
  | "grover"
  | "apple"
  | "deeploi"
  | "list"
  | "goal"
  | "mails"
  | "check";

type Detail = {
  title: string;
  intro: string;
  steps: ReactNode[];
  prompt?: string;
};

const code = (text: string) => (
  <code className="border border-border bg-background px-1 py-0.5 text-xs text-accent">
    {text}
  </code>
);

const DETAILS: Record<NodeId, Detail> = {
  amazon: {
    title: "Amazon · purchased devices",
    intro: "Two scripts that run in the browser console on amazon.de.",
    steps: [
      <>
        Clear old progress once in the console:{" "}
        {code('localStorage.removeItem("amazon_order_import_accumulator")')}
      </>,
      <>
        Open page 1 of the Amazon order history, paste{" "}
        {code("extraction_scripts/amazon_1.js")} into the DevTools console and
        press Enter. Go to the next page yourself and paste it again. Repeat for
        every page.
      </>,
      <>
        On the same Amazon domain, paste {code("extraction_scripts/amazon_2.js")}.
        It downloads {code("amazon-orders.json")}.
      </>,
      <>Upload that file with “Import” in the device table.</>,
    ],
  },
  grover: {
    title: "Grover · rented devices",
    intro: "One script that runs in the browser console on the Grover dashboard.",
    steps: [
      "Open the asset list in the Grover business dashboard.",
      <>
        Paste {code("extraction_scripts/grover.js")} into the DevTools console
        and press Enter. It scrolls through the table by itself. Wait for
        “Captured N devices.”
      </>,
      <>It downloads {code("grover-devices.json")}.</>,
      <>Upload that file with “Import” in the device table.</>,
    ],
  },
  apple: {
    title: "Apple Leasing · leased devices",
    intro: "No script. This source is maintained by hand.",
    steps: [
      "Check the current Apple Leasing contract list for new or returned devices.",
      <>
        Add new devices with “+ Add device”, or collect several in an Excel file
        and upload it with “Import”.
      </>,
      "Devices that went back to Apple Leasing are set to returned by hand.",
    ],
  },
  deeploi: {
    title: "Deeploi · device management",
    intro: "Download the device list from Deeploi, then upload it here.",
    steps: [
      "Open Deeploi and download the device export as an Excel file.",
      <>
        Upload the file unchanged with “Import” in the device table. Deeploi
        columns such as {code("Serial Number")}, {code("Name")},{" "}
        {code("Device Type")}, {code("Enrollment Status")} and{" "}
        {code("Assigned To")} are recognised automatically.
      </>,
      "Existing devices are matched by serial number and updated. This is also what updates the enrollment status.",
    ],
  },
  list: {
    title: "Device list · weekly update",
    intro: "Once a week, all four sources are refreshed in this order.",
    steps: [
      "Amazon: run both scripts, import the JSON.",
      "Grover: run the script, import the JSON.",
      "Apple Leasing: update by hand.",
      "Deeploi: download the export, import it.",
      "Run the weekly mail check for Grover returns (see below).",
    ],
  },
  goal: {
    title: "Goal · everything in Deeploi",
    intro:
      "Every laptop, phone and tablet must be registered in Deeploi.",
    steps: [
      "Filter the device table by enrollment status to find devices that are not enrolled yet.",
      "Ask the person to register the device with the “register device” link in Deeploi.",
      "Document every change of ownership, ideally with an Asana task.",
    ],
  },
  mails: {
    title: "Grover mails · return confirmations",
    intro:
      "Grover sends a mail as soon as a device has been returned successfully.",
    steps: [
      "These mails arrive in our shared IT mailbox.",
      "Only a confirmation of a completed return counts. Announcements and return labels do not.",
      "Once a week, paste the prompt below into Claude (with Gmail access) to turn them into a spreadsheet.",
      "Upload the result with “Import returned” (see the “Weekly mail check” box).",
    ],
    prompt: RETURN_MAIL_PROMPT,
  },
  check: {
    title: "Weekly mail check · returned devices",
    intro:
      "Once a week, Claude reads the Grover mails and creates an Excel file. You import it.",
    steps: [
      "Open Claude with Gmail access and paste the prompt below.",
      "Check the answer: skipped mails without a serial number need a manual look.",
      "Save the Excel file and upload it with “Import returned”.",
      "The preview shows which devices will be marked returned. Confirm the import.",
    ],
    prompt: RETURN_MAIL_PROMPT,
  },
};

type NodeSpec = {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  title: string;
  sub: string;
  tone: "source" | "deeploi" | "neutral" | "returns";
};

const NODES: NodeSpec[] = [
  { id: "amazon", x: 20, y: 20, w: 190, title: "Amazon", sub: "Purchased devices", tone: "source" },
  { id: "grover", x: 20, y: 106, w: 190, title: "Grover", sub: "Rented devices", tone: "source" },
  { id: "apple", x: 20, y: 192, w: 190, title: "Apple Leasing", sub: "Leased devices", tone: "source" },
  { id: "deeploi", x: 20, y: 278, w: 190, title: "Deeploi", sub: "Already registered", tone: "deeploi" },
  { id: "list", x: 260, y: 149, w: 170, title: "Device list", sub: "Updated every week", tone: "neutral" },
  { id: "goal", x: 480, y: 149, w: 190, title: "Goal", sub: "All devices in Deeploi", tone: "deeploi" },
  { id: "mails", x: 20, y: 380, w: 190, title: "Grover mails", sub: "Confirm each return", tone: "neutral" },
  { id: "check", x: 260, y: 380, w: 170, title: "Weekly mail check", sub: "Finds returned devices", tone: "returns" },
];

const TONE: Record<NodeSpec["tone"], { fill: string; stroke: string; text: string }> = {
  source: { fill: "#0d1f2b", stroke: "#4aa8e0", text: "#bfe3f8" },
  deeploi: { fill: "#0c2a22", stroke: "#2dfbc4", text: "#b9fbe8" },
  neutral: { fill: "#0d1614", stroke: "#4a6b62", text: "#dff7ef" },
  returns: { fill: "#2a2108", stroke: "#e0a93a", text: "#f6dfa6" },
};

const NODE_H = 60;

const ARROWS: [number, number, number, number][] = [
  [210, 50, 260, 160],
  [210, 136, 260, 173],
  [210, 222, 260, 186],
  [210, 308, 260, 199],
  [430, 179, 480, 179],
  [210, 410, 260, 410],
  [345, 380, 345, 209],
];

const LAST_IMPORT_LABEL: Record<keyof LastImports, string> = {
  amazon: "Amazon",
  grover: "Grover",
  deeploi: "Deeploi",
};

export function DataSources({ lastImports }: { lastImports: LastImports }) {
  const [selected, setSelected] = useState<NodeId>("amazon");
  const [copied, setCopied] = useState(false);
  const detail = DETAILS[selected];

  function select(id: NodeId) {
    setSelected(id);
    setCopied(false);
  }

  function onKey(event: KeyboardEvent, id: NodeId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(id);
    }
  }

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-labelledby="data-sources-heading"
      className="mb-6 border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="data-sources-heading" className="text-sm font-medium text-accent">
          Where the data comes from
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-pretty text-foreground">
          Four sources feed one device list, which we refresh every week. Click a
          box for instructions.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(LAST_IMPORT_LABEL) as (keyof LastImports)[]).map((key) => {
            const recency = formatImportRecency(lastImports[key]);
            return (
              <div
                key={key}
                title={`Last import: ${recency.exact}`}
                className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs ${
                  recency.stale
                    ? "border-amber-400/40 text-amber-300"
                    : "border-border text-muted"
                }`}
              >
                <span className="font-medium text-foreground">
                  {LAST_IMPORT_LABEL[key]}
                </span>
                <span>·</span>
                <span>{recency.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
        <div className="border-b border-border px-2 py-4 sm:px-4 lg:border-r lg:border-b-0">
          <svg
            viewBox="0 0 700 480"
            role="img"
            aria-label="Amazon, Grover, Apple Leasing and Deeploi feed a weekly updated device list. The goal is that all devices are registered in Deeploi. Grover return mails are checked weekly."
            className="w-full"
          >
            <defs>
              <marker
                id="ds-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke="context-stroke"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
            </defs>

            {ARROWS.map(([x1, y1, x2, y2]) => (
              <line
                key={`${x1}-${y1}-${x2}-${y2}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#7ea89c"
                strokeWidth="1.5"
                markerEnd="url(#ds-arrow)"
              />
            ))}

            {NODES.map((node) => {
              const tone = TONE[node.tone];
              const active = node.id === selected;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${node.title}: ${node.sub}`}
                  onClick={() => select(node.id)}
                  onKeyDown={(event) => onKey(event, node.id)}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3]"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.w}
                    height={NODE_H}
                    rx="2"
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={active ? 3 : 1.5}
                    opacity={active ? 1 : 0.8}
                  />
                  <text
                    x={node.x + node.w / 2}
                    y={node.y + 23}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="500"
                    fill={tone.text}
                  >
                    {node.title}
                  </text>
                  <text
                    x={node.x + node.w / 2}
                    y={node.y + 41}
                    textAnchor="middle"
                    fontSize="12"
                    fill={tone.text}
                    opacity="0.75"
                  >
                    {node.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="min-w-0 px-4 py-4 sm:px-5" aria-live="polite">
          <h3 className="text-sm font-medium text-foreground">{detail.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{detail.intro}</p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {detail.steps.map((step, index) => (
              <li key={index} className="flex gap-3 text-sm leading-relaxed">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-accent/50 text-xs text-accent"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 text-foreground">{step}</span>
              </li>
            ))}
          </ol>

          {detail.prompt && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-muted">Prompt</span>
                <button
                  type="button"
                  onClick={() => copyPrompt(detail.prompt!)}
                  className="border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto border border-border bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {detail.prompt}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
