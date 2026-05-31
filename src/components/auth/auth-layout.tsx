import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { AuthHero } from "@/components/auth/auth-hero";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  className,
}: AuthLayoutProps) {
  return (
    <main className="bg-muted grid min-h-svh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="bg-background flex min-h-svh flex-col gap-8 p-6 md:p-10">
        <div className="flex justify-center md:justify-start">
          <Link href="/login" className="flex items-center gap-2 font-medium">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl">
              <SparklesIcon className="size-4" />
            </span>
            Rozetta
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className={cn("w-full max-w-sm", className)}>
            <div className="mb-7 flex flex-col gap-2 text-center md:text-left">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {eyebrow}
              </span>
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                {title}
              </h1>
              <p className="text-muted-foreground text-sm leading-6 text-balance">
                {description}
              </p>
            </div>
            {children}
          </div>
        </div>
      </section>
      <aside className="relative hidden overflow-hidden border-l bg-muted lg:block">
        <AuthHero />
      </aside>
    </main>
  );
}
