"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { Kbd } from "@mantine/core";
import { resolveDocIcon } from "~/lib/docs/icons";
import { useDocsNav } from "./DocsNavProvider";

/**
 * The sidebar's list of sections and pages. Rendered inside the desktop
 * column and, below `lg`, inside the drawer opened from the mobile bar.
 */
export function DocsSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { nav, openSearch } = useDocsNav();

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search the docs"
        className="mb-5 flex w-full items-center gap-2 rounded-lg border border-border-primary bg-surface-secondary px-3 py-2 text-sm text-text-muted transition-colors hover:border-border-focus hover:text-text-secondary"
      >
        <IconSearch size={16} className="shrink-0" />
        <span className="flex-1 text-left">Search docs</span>
        <Kbd size="xs">/</Kbd>
      </button>

      {nav.map((section) => (
        <div key={section.id} className="mb-6">
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {section.title}
          </h3>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = resolveDocIcon(item.icon);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                      isActive
                        ? "bg-surface-secondary font-medium text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-primary" />
                    )}
                    {Icon && (
                      <Icon
                        size={16}
                        className={`shrink-0 transition-colors duration-200 ${
                          isActive ? "text-brand-primary" : "text-text-muted group-hover:text-text-secondary"
                        }`}
                      />
                    )}
                    <span className="truncate">{item.title}</span>
                  </Link>

                  {item.children && (
                    <ul className="ml-6 mt-1 space-y-1 border-l border-border-primary pl-2">
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={isChildActive ? "page" : undefined}
                              className={`group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-200 ${
                                isChildActive
                                  ? "bg-surface-secondary font-medium text-text-primary"
                                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                              }`}
                            >
                              <span className="truncate">{child.title}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
