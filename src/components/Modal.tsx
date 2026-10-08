"use client";

import { type ReactNode, useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div
        className={`glow w-full ${wide ? "max-w-2xl" : "max-w-md"} border border-accent/40 bg-surface p-6`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-wide text-accent">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition hover:text-accent"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
