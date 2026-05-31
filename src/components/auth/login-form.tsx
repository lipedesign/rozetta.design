"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInWithPassword, type AuthFormState } from "@/lib/auth/actions";
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

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signInWithPassword,
    {}
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="next" value={next ?? ""} />
        <FieldGroup>
          {state.message && (
            <FieldError className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
              {state.message}
            </FieldError>
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
          <Field data-invalid={Boolean(state.errors?.password)}>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/auth/reset-password"
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state.errors?.password)}
            />
            <FieldError>{state.errors?.password?.[0]}</FieldError>
          </Field>
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Create one
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
      <OAuthButtons />
    </div>
  );
}
