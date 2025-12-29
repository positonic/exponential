"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { getPrevNextPages } from "~/lib/docs/navigation";

export function DocsPrevNext() {
  const pathname = usePathname();
  const { prev, next } = getPrevNextPages(pathname);

  if (!prev && !next) {
    return null;
  }

  return (
    <nav className="mt-12 flex items-center justify-between border-t border-border-primary pt-6">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex items-center gap-2 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-surface-hover"
        >
          <IconArrowLeft
            size={16}
            className="text-text-muted transition-transform group-hover:-translate-x-1"
          />
          <div className="text-left">
            <div className="text-xs text-text-muted">Previous</div>
            <div className="font-medium text-text-primary">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group flex items-center gap-2 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-surface-hover"
        >
          <div className="text-right">
            <div className="text-xs text-text-muted">Next</div>
            <div className="font-medium text-text-primary">{next.title}</div>
          </div>
          <IconArrowRight
            size={16}
            className="text-text-muted transition-transform group-hover:translate-x-1"
          />
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
