"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpWithPassword, type AuthFormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUpWithPassword,
    {}
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        <FieldGroup>
          {state.message && (
            <div className="rounded-2xl border bg-muted/60 p-3 text-sm">
              {state.message}
            </div>
          )}
          <Field data-invalid={Boolean(state.errors?.name)}>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              required
              aria-invalid={Boolean(state.errors?.name)}
            />
            <FieldError>{state.errors?.name?.[0]}</FieldError>
          </Field>
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
          <Field data-invalid={Boolean(state.errors?.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
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
              required
              aria-invalid={Boolean(state.errors?.confirmPassword)}
            />
            <FieldError>{state.errors?.confirmPassword?.[0]}</FieldError>
          </Field>
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create account"}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
      <OAuthButtons label="Or sign up with" />
    </div>
  );
}
