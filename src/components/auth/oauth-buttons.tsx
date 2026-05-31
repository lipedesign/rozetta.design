"use client";

import { signInWithOAuthProvider } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldSeparator } from "@/components/ui/field";

export function OAuthButtons({ label = "Continue with" }: { label?: string }) {
  return (
    <FieldGroup className="gap-4">
      <FieldSeparator>{label}</FieldSeparator>
      <Field className="grid grid-cols-2 gap-2">
        <form action={signInWithOAuthProvider}>
          <input type="hidden" name="provider" value="google" />
          <Button variant="outline" type="submit" className="w-full">
            <span className="font-semibold">G</span>
            Google
          </Button>
        </form>
        <form action={signInWithOAuthProvider}>
          <input type="hidden" name="provider" value="github" />
          <Button variant="outline" type="submit" className="w-full">
            <span className="font-mono text-sm">GH</span>
            GitHub
          </Button>
        </form>
      </Field>
    </FieldGroup>
  );
}
