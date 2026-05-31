import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { isSupabaseAuthConfigured } from "@/lib/auth/config";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";

export default async function ResetPasswordPage() {
  const hasRecoverySession = await hasCurrentSession();

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title={hasRecoverySession ? "Choose a new password" : "Reset your password"}
      description={
        hasRecoverySession
          ? "Set a new password for your Rozetta account."
          : "We will send a secure reset link if the email belongs to a Rozetta account."
      }
    >
      <ResetPasswordForm mode={hasRecoverySession ? "update" : "request"} />
    </AuthLayout>
  );
}

async function hasCurrentSession() {
  if (!isSupabaseAuthConfigured()) return false;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}
