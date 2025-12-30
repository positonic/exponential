"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "~/lib/admin/navigation";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-64 shrink-0 border-r border-border-primary bg-background-primary">
      <div className="sticky top-0 h-screen overflow-y-auto p-4">
        {/* Admin Header */}
        <div className="mb-6 px-3">
          <h2 className="text-lg font-semibold text-text-primary">Admin Panel</h2>
        </div>

        {adminNavigation.map((section, sectionIndex) => (
          <div key={section.title || `section-${sectionIndex}`} className="mb-6">
            {/* Section header */}
            {section.title && (
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {section.title}
              </h3>
            )}

            {/* Section items */}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <li key={item.title}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                          isActive
                            ? "bg-surface-secondary font-medium text-text-primary"
                            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                        )}
                        {Icon && (
                          <Icon
                            size={16}
                            className={`shrink-0 transition-colors duration-200 ${
                              isActive
                                ? "text-blue-500"
                                : "text-text-muted group-hover:text-text-secondary"
                            }`}
                          />
                        )}
                        <span className="truncate">{item.title}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-3 px-3 py-2 text-sm text-text-secondary">
                        {Icon && (
                          <Icon size={16} className="shrink-0 text-text-muted" />
                        )}
                        <span className="truncate">{item.title}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
