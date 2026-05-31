"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordReset,
  updatePassword,
  type AuthFormState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ mode = "request" }: { mode?: "request" | "update" }) {
  if (mode === "update") return <UpdatePasswordForm />;
  return <RequestPasswordResetForm />;
}

function RequestPasswordResetForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {}
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        {state.message && (
          <div className="rounded-2xl border bg-muted/60 p-3 text-sm">
            {state.message}
          </div>
        )}
        <Field data-invalid={Boolean(state.errors?.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            aria-invalid={Boolean(state.errors?.email)}
          />
          <FieldError>{state.errors?.email?.[0]}</FieldError>
        </Field>
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send reset link"}
          </Button>
        </Field>
        <FieldDescription className="text-center">
          Remembered it?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}

function UpdatePasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    {}
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        {state.message && (
          <div className="rounded-2xl border bg-muted/60 p-3 text-sm">
            {state.message}
          </div>
        )}
        <Field data-invalid={Boolean(state.errors?.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            aria-invalid={Boolean(state.errors?.password)}
          />
          <FieldDescription>Use at least 12 characters.</FieldDescription>
          <FieldError>{state.errors?.password?.[0]}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.errors?.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            aria-invalid={Boolean(state.errors?.confirmPassword)}
          />
          <FieldError>{state.errors?.confirmPassword?.[0]}</FieldError>
        </Field>
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Updating..." : "Update password"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
