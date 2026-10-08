import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    console.error(
      "auth callback: no ?code param, full URL was:",
      request.url,
    );
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth callback: exchangeCodeForSession failed:", error);
    return NextResponse.redirect(`${origin}/login`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
