const DEV_AUTH_MODE = "dev";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export function isSupabaseAuthConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  return Boolean(
    url &&
      key &&
      !url.includes("your-") &&
      !key.includes("your-") &&
      !key.includes("publishable-key")
  );
}

export function isAuthDisabledForRuntime() {
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ROZETTA_AUTH_MODE === DEV_AUTH_MODE || !isSupabaseAuthConfigured();
}

export function requireSupabaseAuthEnv() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for Supabase Auth."
    );
  }
  return { url, key };
}
