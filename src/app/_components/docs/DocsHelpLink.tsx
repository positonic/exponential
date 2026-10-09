"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";
import { docsHrefForPath } from "~/lib/docs/appLinks";

/**
 * A small `?` that opens the docs page for the current screen. Renders
 * nothing on screens without a matching page, so it is safe to drop into
 * any header.
 */
export function DocsHelpLink({ pathname: override }: { pathname?: string }) {
  const current = usePathname();
  const href = docsHrefForPath(override ?? current);
  if (!href) return null;

  return (
    <Tooltip label="Help for this page" withArrow openDelay={300}>
      <Link
        href={href}
        aria-label="Help for this page"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <IconHelp size={16} stroke={1.75} />
      </Link>
    </Tooltip>
  );
}
