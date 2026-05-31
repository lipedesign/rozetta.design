import { NextResponse, type NextRequest } from "next/server";

import { isAuthDisabledForRuntime } from "@/lib/auth/config";
import { updateSupabaseSession } from "@/lib/auth/supabase/middleware";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/auth/callback",
  "/auth/reset-password",
  "/api/figma/snapshot",
  "/api/figma/writeback",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const { response, user } = await updateSupabaseSession(request);

  if (!isAuthDisabledForRuntime() && !user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
