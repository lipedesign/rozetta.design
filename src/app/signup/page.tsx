import { AuthLayout } from "@/components/auth/auth-layout";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthLayout
      eyebrow="Start secure"
      title="Create your workspace"
      description="Set up an account for tokens, themes, Figma sync and reviewed AI changes."
    >
      <SignupForm />
    </AuthLayout>
  );
}
