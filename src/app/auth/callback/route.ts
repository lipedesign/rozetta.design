import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace-context";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await ensureUserWorkspace(user);
  }

  return NextResponse.redirect(new URL(safeNext(next), url.origin));
}

function safeNext(next: string) {
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
