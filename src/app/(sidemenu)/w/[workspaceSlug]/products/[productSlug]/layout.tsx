"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconBulb,
  IconTicket,
  IconMicrophone,
  IconCalendarClock,
  IconClipboardList,
  IconSettings,
} from "@tabler/icons-react";
import { Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

const subNav = [
  { label: "Overview", href: "", icon: IconLayoutDashboard },
  { label: "Features", href: "/features", icon: IconBulb },
  { label: "Tickets", href: "/tickets", icon: IconTicket },
  { label: "Research", href: "/research", icon: IconMicrophone },
  { label: "Cycles", href: "/cycles", icon: IconCalendarClock },
  { label: "Retrospectives", href: "/retrospectives", icon: IconClipboardList },
  { label: "Settings", href: "/settings", icon: IconSettings },
];

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    {
      workspaceId: workspaceId ?? "",
      slug: productSlug,
    },
    { enabled: !!workspaceId && !!productSlug },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  return (
    <div className="-m-4 flex min-h-screen lg:-m-8">
      <nav className="w-60 shrink-0 border-r border-border-primary bg-background-primary">
        <div className="sticky top-0 h-screen overflow-y-auto p-4">
          <div className="mb-6 px-3">
            <Link
              href={`/w/${workspace.slug}/products`}
              className="text-xs uppercase text-text-muted hover:text-text-secondary"
            >
              ← Products
            </Link>
            {isLoading ? (
              <Skeleton height={24} width={160} mt={8} />
            ) : product ? (
              <h2 className="mt-1 text-lg font-semibold text-text-primary truncate">
                {product.name}
              </h2>
            ) : (
              <Text className="text-text-muted" size="sm">
                Product not found
              </Text>
            )}
          </div>

          <ul className="space-y-1">
            {subNav.map((item) => {
              const href = `${basePath}${item.href}`;
              const isActive =
                item.href === ""
                  ? pathname === href
                  : pathname === href || pathname.startsWith(href + "/");
              const Icon = item.icon;

              return (
                <li key={item.label}>
                  <Link
                    href={href}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                      isActive
                        ? "bg-surface-secondary font-medium text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                    )}
                    <Icon
                      size={16}
                      className={`shrink-0 transition-colors duration-200 ${
                        isActive
                          ? "text-blue-500"
                          : "text-text-muted group-hover:text-text-secondary"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
