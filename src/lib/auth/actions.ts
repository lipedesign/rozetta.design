"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { ensureUserWorkspace, switchWorkspace as switchWorkspaceContext } from "@/lib/auth/workspace-context";

export interface AuthFormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const emailSchema = z.email("Enter a valid email.").trim().toLowerCase();
const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.");

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

const signUpSchema = z
  .object({
    name: z.string().min(2, "Enter your name.").trim(),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const resetSchema = z.object({
  email: emailSchema,
});

const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function signInWithPassword(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      ok: false,
      message: "Could not sign in. Check your credentials and try again.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await ensureUserWorkspace(user);

  revalidatePath("/", "layout");
  redirect(safeNext(parsed.data.next));
}

export async function signUpWithPassword(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createServerSupabaseClient();
  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.name,
      },
      emailRedirectTo: await callbackUrl(),
    },
  });

  if (error) {
    return {
      ok: false,
      message: "Could not create the account. Try again in a moment.",
    };
  }

  if (data.user && data.session) {
    await ensureUserWorkspace(data.user);
    revalidatePath("/", "layout");
    redirect("/");
  }

  return {
    ok: true,
    message: "Check your email to confirm the account before signing in.",
  };
}

export async function signInWithOAuthProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "github") {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: await callbackUrl(),
    },
  });

  if (error || !data.url) {
    redirect("/login");
  }

  redirect(data.url);
}

export async function requestPasswordReset(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await callbackUrl("/auth/callback?next=/auth/reset-password"),
  });

  return {
    ok: true,
    message: "If this email exists, a reset link will arrive soon.",
  };
}

export async function updatePassword(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      ok: false,
      message: "Could not update the password. Use a fresh reset link and try again.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function switchWorkspace(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!workspaceId) return;
  await switchWorkspaceContext(workspaceId);
  revalidatePath("/", "layout");
}

async function callbackUrl(path = "/auth/callback") {
  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    `${headersList.get("x-forwarded-proto") ?? "http"}://${headersList.get("host")}`;
  return new URL(path, origin).toString();
}

function fieldErrors(error: z.ZodError): AuthFormState {
  return {
    ok: false,
    errors: error.flatten().fieldErrors,
  };
}

function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
