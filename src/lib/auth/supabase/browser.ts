"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseAuthEnv } from "@/lib/auth/config";

export function createBrowserSupabaseClient() {
  const { url, key } = requireSupabaseAuthEnv();
  return createBrowserClient(url, key);
}
