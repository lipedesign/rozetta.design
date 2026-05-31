import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthLayout
      eyebrow="Secure workspace"
      title="Sign in to Rozetta"
      description="Access your design system workspace, AI review queue and sync history."
    >
      <LoginForm next={params.next} />
    </AuthLayout>
  );
}
