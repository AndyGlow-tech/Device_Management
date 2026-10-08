const FLOWS = [
  {
    source: "Grover",
    ownership: "rented",
    steps: [
      "Rent the device from Grover",
      "A user works with it",
      "Return it to Grover when the person leaves or gets a new device",
    ],
  },
  {
    source: "Amazon",
    ownership: "purchased",
    steps: [
      "Buy the device from Amazon",
      "A user works with it",
      "Send it to Brickhub when the person leaves or the device is renewed. Contact: Oliver Arnim",
    ],
  },
] as const;

export function DeviceLifecycle() {
  return (
    <section
      aria-labelledby="device-lifecycle-heading"
      className="mb-6 border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2
          id="device-lifecycle-heading"
          className="text-sm font-medium text-accent"
        >
          Device lifecycle
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-pretty text-foreground">
          The goal is a complete overview of each device&apos;s lifecycle and
          current status, and to register every laptop, iPhone, and tablet in
          deeploi.
        </p>
      </div>

      <div className="grid md:grid-cols-2">
        {FLOWS.map((flow, index) => (
          <div
            key={flow.source}
            className={`px-4 py-4 sm:px-5 ${
              index === 0
                ? "border-b border-border md:border-r md:border-b-0"
                : ""
            }`}
          >
            <p className="text-sm">
              <span className="font-medium text-foreground">{flow.source}</span>
              <span className="text-muted"> · {flow.ownership}</span>
            </p>
            <ol className="mt-3 flex flex-col gap-2.5">
              {flow.steps.map((step, stepIndex) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed">
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-accent/50 text-xs text-accent"
                    aria-hidden="true"
                  >
                    {stepIndex + 1}
                  </span>
                  <span className="text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <ul className="max-w-[68ch] space-y-2 border-t border-border px-4 py-4 text-sm leading-relaxed text-pretty text-foreground sm:px-5">
        <li>
          Each change in ownership should be properly described. Ideally, this
          happens with an Asana task.
        </li>
        <li>
          People whose devices haven&apos;t been registered yet can do so by
          clicking the register device link in deeploi.
        </li>
      </ul>

      <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-pretty text-muted sm:px-5">
        Records are taken from the Grover dashboard, Amazon orders, and exports
        downloaded from deeploi.
      </p>
    </section>
  );
}
