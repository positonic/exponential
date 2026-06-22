"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconLayoutList,
  IconBulb,
  IconCalendarClock,
  IconClipboardList,
  IconSettings,
  IconPlus,
  IconAffiliate,
  IconTargetArrow,
} from "@tabler/icons-react";
import {
  ActionIcon,
  Group,
  Skeleton,
  Tabs,
  Text,
  Title,
  Stack,
} from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { FavoriteButton } from "~/app/_components/shared/FavoriteButton";
import { buildProductFavoriteTarget } from "./favoriteTarget";

const tabs = [
  { value: "overview", href: "", label: "Overview", icon: IconHome },
  { value: "problems", href: "/problems", label: "Problems", icon: IconTargetArrow },
  { value: "backlog", href: "/tickets", label: "Backlog", icon: IconLayoutList },
  { value: "features", href: "/features", label: "Features", icon: IconBulb },
  { value: "graph", href: "/graph", label: "Graph", icon: IconAffiliate },
  { value: "cycles", href: "/cycles", label: "Cycles", icon: IconCalendarClock },
  { value: "research", href: "/research", label: "Insights", icon: IconBulb },
  { value: "retro", href: "/retrospectives", label: "Retro", icon: IconClipboardList },
] as const;

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [isPending, startTransition] = useTransition();
  // Tab the user just clicked, shown as active immediately while the route
  // navigation is still pending — so the click feels acknowledged at once.
  const [optimisticTab, setOptimisticTab] = useState<string | null>(null);

  const utils = api.useUtils();

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    {
      workspaceId: workspaceId ?? "",
      slug: productSlug,
    },
    { enabled: !!workspaceId && !!productSlug },
  );

  // Warm every sibling tab's route (RSC payload + JS chunk) as soon as a
  // product page mounts, so the first click on any tab is instant instead of
  // paying the cold route-fetch cost. Mirrors what Next <Link> prefetch does
  // for in-viewport links; no-op in dev (Next disables prefetch there).
  useEffect(() => {
    if (!workspace) return;
    const base = `/w/${workspace.slug}/products/${productSlug}`;
    for (const tab of tabs) {
      router.prefetch(`${base}${tab.href}`);
    }
  }, [workspace, productSlug, router]);

  // Warm the *data* for every tab once the product resolves, so the first click
  // on any tab finds its query already in cache and renders without a skeleton.
  // Deferred to browser-idle so it never competes with the tab you're actually
  // looking at. Inputs must match each page's useQuery exactly (incl. their
  // default toggle state) or the cache key won't hit.
  const productId = product?.id;
  useEffect(() => {
    if (!productId || !workspaceId) return;
    if (typeof window === "undefined") return;

    const warm = () => {
      void utils.product.problem.list.prefetch({ productId, includeParked: false });
      void utils.product.ticket.list.prefetch({ productId });
      void utils.product.feature.list.prefetch({ productId });
      void utils.product.product.getDependencyGraph.prefetch({
        productId,
        includeCompleted: false,
      });
      void utils.product.insight.list.prefetch({ productId });
      // NB: cycle.list is intentionally NOT prewarmed — with autoCreate it
      // writes (ensureUpcomingCycles / reconcileCycleStatuses), so eagerly
      // prefetching it would create sprint data for products whose Cycles tab
      // is never opened. The Cycles tab still feels instant via loading.tsx.
      void utils.product.retrospective.list.prefetch({ workspaceId, productId });
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, [productId, workspaceId, utils]);

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;
  const isSettings = pathname === `${basePath}/settings` || pathname.startsWith(`${basePath}/settings/`);

  // Settings gets its own standalone page - no header or tabs
  if (isSettings) {
    return <div className="w-full">{children}</div>;
  }

  // Determine active tab from pathname
  const pathnameTab =
    tabs.find(
      (t) =>
        t.href !== "" &&
        (pathname === `${basePath}${t.href}` ||
          pathname.startsWith(`${basePath}${t.href}/`)),
    )?.value ?? "overview";
  // While a navigation is pending, show the just-clicked tab as active so the
  // tab bar responds instantly; fall back to the real route once it commits.
  const activeTab = isPending && optimisticTab ? optimisticTab : pathnameTab;

  const handleTabChange = (value: string | null) => {
    const tab = tabs.find((t) => t.value === value);
    if (!tab || value === pathnameTab) return;
    setOptimisticTab(value);
    startTransition(() => {
      router.push(`${basePath}${tab.href}`);
    });
  };

  return (
    <div className="w-full">
      {/* Header: Title + action icons */}
      <div className="w-full px-10 pt-6 mb-6">
        <Group justify="space-between" align="flex-start">
          <div>
            {isLoading ? (
              <Skeleton height={32} width={220} mb={4} />
            ) : product ? (
              <>
                <Title
                  order={2}
                  mb={4}
                  className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent"
                >
                  {product.name}
                </Title>
                {product.description && (
                  <Text size="sm" c="dimmed" lineClamp={2} maw={800}>
                    {product.description}
                  </Text>
                )}
              </>
            ) : (
              <Text className="text-text-muted">Product not found</Text>
            )}
          </div>
          <Group gap="xs">
            {product && workspaceId && (
              <FavoriteButton
                entityType="page"
                {...buildProductFavoriteTarget({
                  pathname,
                  workspaceSlug: workspace.slug,
                  productSlug,
                  productName: product.name,
                })}
                workspaceId={workspaceId}
                size="lg"
                variant="default"
              />
            )}
            <ActionIcon
              variant="filled"
              size="lg"
              title="Add"
              className="hover:scale-105"
              style={{ transition: "all 0.2s ease" }}
            >
              <IconPlus size={20} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              size="lg"
              title="Product Settings"
              className="hover:scale-105"
              style={{ transition: "all 0.2s ease" }}
              onClick={() => router.push(`${basePath}/settings`)}
            >
              <IconSettings size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Stack gap="xl" align="stretch" justify="flex-start">
          <Tabs.List className="px-10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  leftSection={<Icon size={16} />}
                >
                  {tab.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>

          {/* Tab content */}
          <div className="px-10 pb-6">{children}</div>
        </Stack>
      </Tabs>
    </div>
  );
}
