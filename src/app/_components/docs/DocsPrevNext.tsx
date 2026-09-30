"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { getPrevNextPages } from "~/lib/docs/navigation";
import { useDocsNav } from "./DocsNavProvider";

export function DocsPrevNext() {
  const pathname = usePathname();
  const { nav } = useDocsNav();
  const { prev, next } = getPrevNextPages(nav, pathname);

  if (!prev && !next) {
    return null;
  }

  return (
    <nav aria-label="Previous and next page" className="mt-12 flex items-center justify-between gap-4 border-t border-border-primary pt-6">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex min-w-0 items-center gap-2 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-surface-hover"
        >
          <IconArrowLeft
            size={16}
            className="shrink-0 text-text-muted transition-transform group-hover:-translate-x-1"
          />
          <div className="min-w-0 text-left">
            <div className="text-xs text-text-muted">Previous</div>
            <div className="truncate font-medium text-text-primary">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group flex min-w-0 items-center gap-2 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-surface-hover"
        >
          <div className="min-w-0 text-right">
            <div className="text-xs text-text-muted">Next</div>
            <div className="truncate font-medium text-text-primary">{next.title}</div>
          </div>
          <IconArrowRight
            size={16}
            className="shrink-0 text-text-muted transition-transform group-hover:translate-x-1"
          />
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
