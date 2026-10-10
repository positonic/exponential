import Link from "next/link";
import type { ReactNode } from "react";

import { PublicThemeToggle } from "~/app/(published)/p/[slugId]/_components/PublicThemeToggle";

/** Public chrome for a workspace's updates: same header / footer as published Pages. */
export function UpdatesShell({
  workspaceName,
  indexHref,
  feedHref,
  children,
}: {
  workspaceName: string;
  indexHref: string;
  feedHref: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border-primary bg-background-primary/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <Link
            href={indexHref}
            className="text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            {workspaceName} updates
          </Link>
          <div className="flex items-center gap-3">
            <a href={feedHref} className="text-xs text-text-muted transition-colors hover:text-text-secondary">
              RSS
            </a>
            <PublicThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-border-primary">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <Link href="/" className="text-xs text-text-muted transition-colors hover:text-text-secondary">
            Published with Exponential
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function formatPublishedDate(date: Date): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
