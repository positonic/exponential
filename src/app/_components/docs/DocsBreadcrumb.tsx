"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronRight } from "@tabler/icons-react";
import { getBreadcrumbs } from "~/lib/docs/navigation";

export function DocsBreadcrumb() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm">
      {breadcrumbs.map((crumb, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && (
            <IconChevronRight size={14} className="text-text-muted" />
          )}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="text-text-secondary transition-colors hover:text-text-primary"
            >
              {crumb.title}
            </Link>
          ) : (
            <span className="text-text-muted">{crumb.title}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
