import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAuthDisabledForRuntime, requireSupabaseAuthEnv } from "@/lib/auth/config";

export async function updateSupabaseSession(request: NextRequest) {
  if (isAuthDisabledForRuntime()) {
    return {
      response: NextResponse.next({ request }),
      user: null,
    };
  }

  const { url, key } = requireSupabaseAuthEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
