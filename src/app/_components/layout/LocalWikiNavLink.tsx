"use client";

import { IconBook2 } from "@tabler/icons-react";

import { WIKI_ROUTE } from "~/lib/wiki/wikiLinks";
import { useWikiBridge } from "~/lib/wiki/useWikiBridge";
import { NavLink } from "./NavLinks";

/**
 * Sidebar entry for the local wiki, shown only where there is one.
 *
 * Global rather than workspace-scoped, like Inbox and Today: the wiki is a
 * folder on this device and belongs to no workspace. Hidden entirely in a
 * browser, where the shell commands it needs don't exist.
 */
export function LocalWikiNavLink() {
  const { bridge } = useWikiBridge();
  if (!bridge) return null;

  return (
    <NavLink href={WIKI_ROUTE} icon={IconBook2}>
      Local wiki
    </NavLink>
  );
}
