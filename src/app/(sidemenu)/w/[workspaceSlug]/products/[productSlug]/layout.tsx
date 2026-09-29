"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconLayoutList,
  IconBulb,
  IconCalendarClock,
  IconClipboardList,
  IconFlag,
  IconSettings,
  IconPlus,
  IconAffiliate,
  IconTargetArrow,
  IconMicrophone,
  IconTicket,
} from "@tabler/icons-react";
import {
  ActionIcon,
  Group,
  Menu,
  Tabs,
  Text,
  Tooltip,
  Stack,
} from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import { api } from "~/trpc/react";
import { FavoriteButton } from "~/app/_components/shared/FavoriteButton";
import { useRegisterTopbarCrumbs } from "~/app/_components/layout/TopbarCrumbs";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";
import { buildProductFavoriteTarget } from "./favoriteTarget";

const tabs = [
  { value: "overview", href: "", label: "Overview", icon: IconHome },
  { value: "backlog", href: "/tickets", label: "Backlog", icon: IconLayoutList },
  { value: "features", href: "/features", label: "Features", icon: IconBulb },
  { value: "graph", href: "/graph", label: "Graph", icon: IconAffiliate },
  { value: "cycles", href: "/cycles", label: "Cycles", icon: IconCalendarClock },
  { value: "insights", href: "/insights", label: "Insights", icon: IconTargetArrow },
  { value: "decisions", href: "/decisions", label: "Decisions", icon: IconFlag },
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
  const [ticketModalOpen, setTicketModalOpen] = useState(false);

  const utils = api.useUtils();

  // On narrow screens the tab strip scrolls horizontally; nudge it so the
  // active tab is never hidden off an edge. Horizontal only — scrollIntoView
  // would also move the page vertically.
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = tabsScrollRef.current;
    const active = scroller?.querySelector<HTMLElement>("[data-active]");
    if (!scroller || !active) return;
    const s = scroller.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < s.left) scroller.scrollLeft += a.left - s.left - 16;
    else if (a.right > s.right) scroller.scrollLeft += a.right - s.right + 16;
  }, [pathname]);

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    {
      workspaceId: workspaceId ?? "",
      slug: productSlug,
    },
    { enabled: !!workspaceId && !!productSlug },
  );

  // On a cycle detail route (…/cycles/<id>) fetch that cycle so the favourite
  // snapshots the cycle's own name (e.g. "Cycle 10") instead of the generic
  // "<Product> · Cycles" tab label. Derive the id from the pathname rather than
  // params — this layout owns the `[productSlug]` segment, so `params` does not
  // reliably expose the deeper `[cycleId]` segment. Excludes the "/cycles/new"
  // create route. React Query dedupes this with the cycle detail page's own
  // getById call, so it's not an extra request; when navigating to any other
  // tab the id resolves to undefined and the label falls back to the tab label.
  const cyclesPrefix = `/products/${productSlug}/cycles/`;
  const cyclesIdx = pathname.indexOf(cyclesPrefix);
  const cycleSegment =
    cyclesIdx === -1
      ? undefined
      : pathname.slice(cyclesIdx + cyclesPrefix.length).split("/")[0];
  const cycleId =
    cycleSegment && cycleSegment !== "new" ? cycleSegment : undefined;
  const { data: cycleForFavorite } = api.product.cycle.getById.useQuery(
    { id: cycleId ?? "" },
    { enabled: !!cycleId },
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
  //
  // Only from a tab page itself. A detail route (a ticket, a feature) is still
  // streaming its own queries when the browser first goes idle, and the warm
  // set includes the full ticket list with every body — the heaviest read in
  // the product — for tabs the user may never open from there. It runs once
  // per product, when they land on a tab.
  const productId = product?.id;
  const isOnTab =
    !!workspace &&
    tabs.some(
      (t) => pathname === `/w/${workspace.slug}/products/${productSlug}${t.href}`,
    );
  const warmedProductRef = useRef<string | null>(null);
  useEffect(() => {
    if (!productId || !workspaceId || !isOnTab) return;
    if (warmedProductRef.current === productId) return;
    if (typeof window === "undefined") return;

    const warm = () => {
      warmedProductRef.current = productId;
      void utils.product.ticket.list.prefetch({ productId });
      void utils.product.feature.list.prefetch({ productId });
      void utils.product.product.getDependencyGraph.prefetch({
        productId,
        includeCompleted: false,
      });
      // Matches the Insights page's default query key (includeParked: false).
      void utils.product.insight.list.prefetch({ productId, includeParked: false });
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
  }, [productId, workspaceId, isOnTab, utils]);

  // Tell the AI assistant which product (and tab) the user is looking at, so
  // "the tickets in cycle 10" resolves without the agent asking. The workspace
  // layout registrar yields on /products/ routes — this is the sole owner here.
  const pageContext = useMemo(() => {
    if (!product || !workspace || !workspaceId) return null;
    const base = `/w/${workspace.slug}/products/${productSlug}`;
    const view =
      tabs.find(
        (t) =>
          t.href !== "" &&
          (pathname === `${base}${t.href}` || pathname.startsWith(`${base}${t.href}/`)),
      )?.value ?? "overview";
    return {
      pageType: "product",
      pageTitle: product.name,
      pagePath: pathname,
      data: {
        productId: product.id,
        productName: product.name,
        productSlug,
        workspaceId,
        workspaceSlug: workspace.slug,
        view,
      },
    };
  }, [product, workspace, workspaceId, productSlug, pathname]);

  useRegisterPageContext(pageContext);

  // The product name lives in the workspace breadcrumb (Workspace / Products /
  // <Product>) rather than a title block, the way Projects names itself. It
  // links to the Overview from every other product route.
  const productBasePath = workspace ? `/w/${workspace.slug}/products/${productSlug}` : null;
  useRegisterTopbarCrumbs(
    product && productBasePath
      ? [{ label: product.name, href: pathname === productBasePath ? undefined : productBasePath }]
      : null,
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;
  const isSettings = pathname === `${basePath}/settings` || pathname.startsWith(`${basePath}/settings/`);

  // Settings gets its own standalone page - no header or tabs
  if (isSettings) {
    return <div className="w-full">{children}</div>;
  }

  // Determine active tab from pathname. Epics live at their own `/epics/:id`
  // route but are reached from — and navigate back to — the Backlog tab's
  // entity switcher, so they keep Backlog lit rather than falling through to
  // the "overview" default.
  const pathnameTab =
    pathname === `${basePath}/epics` || pathname.startsWith(`${basePath}/epics/`)
      ? "backlog"
      : (tabs.find(
          (t) =>
            t.href !== "" &&
            (pathname === `${basePath}${t.href}` ||
              pathname.startsWith(`${basePath}${t.href}/`)),
        )?.value ?? "overview");
  // While a navigation is pending, show the just-clicked tab as active so the
  // tab bar responds instantly; fall back to the real route once it commits.
  const activeTab = isPending && optimisticTab ? optimisticTab : pathnameTab;
  // Only the list routes themselves, not their detail pages (/tickets/:id,
  // /features/:id) or /epics, which keep the padded layout.
  const isListTab =
    pathname === `${basePath}/tickets` || pathname === `${basePath}/features`;

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
      {!isLoading && !product && (
        <Text className="px-4 pt-6 text-text-muted sm:px-6 lg:px-10">Product not found</Text>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Stack gap={isListTab ? 0 : "xl"} align="stretch" justify="flex-start">
          {/* One row that scrolls sideways on narrow screens instead of
              wrapping into four. The list grows to max-content inside this
              scroller so Mantine's underline (a ::before on the list) still
              runs under every tab, not just the first viewport of them. */}
          {/* Tabs take the row; the product actions sit at its right end.
              The actions carry the tab list's own underline so the line runs
              unbroken to the edge. */}
          <div className="flex items-stretch">
          <div ref={tabsScrollRef} className="product-tabs-scroll min-w-0 flex-1 overflow-x-auto">
            <Tabs.List className="product-tabs-list pl-4 pt-2 sm:pl-6 lg:pl-10">
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
          </div>
          <Group
            gap={4}
            wrap="nowrap"
            className="shrink-0 pl-2 pr-4 pt-2 sm:pr-6 lg:pr-10"
            // Mantine's own tab-list border vars (set on the Tabs root), so
            // this segment matches the list's underline in both themes.
            style={{
              borderStyle: "solid",
              borderWidth: "var(--tab-border-width)",
              borderColor: "var(--tab-border-color)",
            }}
          >
            {product && workspaceId && (
              <FavoriteButton
                entityType="page"
                {...buildProductFavoriteTarget({
                  pathname,
                  workspaceSlug: workspace.slug,
                  productSlug,
                  productName: product.name,
                  detailLabel: cycleForFavorite?.name,
                })}
                workspaceId={workspaceId}
                buttonColor="gray"
              />
            )}
            <Menu position="bottom-end" width={244} shadow="md">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label="Create in this product">
                  <IconPlus size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Create</Menu.Label>
                <Menu.Item
                  leftSection={<IconTicket size={14} />}
                  onClick={() => setTicketModalOpen(true)}
                >
                  New ticket
                  <Text size="xs" c="dimmed">
                    Add to the backlog
                  </Text>
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconBulb size={14} />}
                  onClick={() => router.push(`${basePath}/features/new`)}
                >
                  New feature
                  <Text size="xs" c="dimmed">
                    A larger unit of value
                  </Text>
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconMicrophone size={14} />}
                  onClick={() => router.push(`${basePath}/research/new`)}
                >
                  New research
                  <Text size="xs" c="dimmed">
                    Interview or finding
                  </Text>
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconClipboardList size={14} />}
                  onClick={() => router.push(`${basePath}/retrospectives/new`)}
                >
                  New retro
                  <Text size="xs" c="dimmed">
                    End-of-cycle review
                  </Text>
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconCalendarClock size={14} />}
                  onClick={() => router.push(`${basePath}/cycles/new`)}
                >
                  New cycle
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Tooltip label="Product settings" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Product settings"
                onClick={() => router.push(`${basePath}/settings`)}
              >
                <IconSettings size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          </div>

          {/* Tab content. List tabs (Backlog, Features) run edge to edge and
              own their gutters, like the Projects page; the rest are padded. */}
          <div className={isListTab ? "pb-6" : "px-4 sm:px-6 lg:px-10 pb-6"}>{children}</div>
        </Stack>
      </Tabs>

      {product && (
        <CreateTicketModal
          opened={ticketModalOpen}
          onClose={() => setTicketModalOpen(false)}
          productId={product.id}
          productName={product.name}
          basePath={`${basePath}/tickets`}
        />
      )}
    </div>
  );
}
