"use client";

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="> search serial, device, owner…"
      className="w-full max-w-xs border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:glow-sm focus:outline-none"
    />
  );
}
