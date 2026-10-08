"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="w-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent hover:glow-sm disabled:opacity-60"
    >
      {pending ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
