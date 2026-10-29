"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Group, Skeleton, Stack, Switch, Tooltip } from "@mantine/core";
import { useSession } from "next-auth/react";
import { IconAffiliate, IconArrowBackUp, IconLink } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { useViewPrefs } from "~/hooks/useViewPrefs";
import { useTicketViewUrl } from "~/hooks/useTicketViewUrl";
import { EmptyState } from "~/app/_components/EmptyState";
import {
  ListPageButton,
  ListPageFilterPills,
  ListPageFilterPopover,
  type ListPageFilterPill,
} from "~/app/_components/listPage";
import {
  DependencyGraphCanvas,
  type GraphNodeClick,
} from "~/app/_components/product/graph/DependencyGraphCanvas";
import { TicketDrawer } from "~/app/_components/product/graph/TicketDrawer";
import { applyGraphFilter } from "~/app/_components/product/graph/graphFilter";
import {
  countActiveTicketFilters,
  deriveTicketFacetOptions,
  EMPTY_TICKET_FILTERS,
  matchesTicketFilters,
  parseSavedTicketFilters,
  TICKET_FILTER_FACETS,
  ticketFacetPillColor,
  ticketFacetPillLabel,
  toggleTicketFilter,
  type TicketFilters,
} from "~/app/_components/product/ticketFilters";

export default function ProductGraphPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [showCompleted, setShowCompleted] = useState(false);
  const [drawerTicketId, setDrawerTicketId] = useState<string | null>(null);

  // The Backlog's facet filters, shared through the same saved view prefs: a
  // filter applied on either tab narrows the other. Changes here save back
  // under the same key, so the Backlog picks them up on its next mount.
  const [prefFilters, setPrefFilters] = useState<TicketFilters>(EMPTY_TICKET_FILTERS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // A link carrying a view (shared from the Backlog or this tab) shows its
  // filters instead of the saved ones; changes then go to the URL, not prefs.
  const { data: session } = useSession();
  const { urlView, replaceView, exitView, copyViewLink } = useTicketViewUrl({
    sessionUserId: session?.user?.id,
  });
  const filters = urlView?.filters ?? prefFilters;
  const { prefs: savedPrefs, isError: prefsFailed, save: savePrefs } =
    useViewPrefs<{ filters: TicketFilters }>({ productSlug, workspaceId }, { debounceMs: 500 });
  useEffect(() => {
    if (savedPrefs && !prefsLoaded) {
      setPrefFilters(parseSavedTicketFilters(savedPrefs.filters));
      setPrefsLoaded(true);
    }
  }, [savedPrefs, prefsLoaded]);
  // Hold the canvas until the saved filters are known: a graph drawn
  // unfiltered first would re-layout the moment they land.
  // A link's filters need nothing from the prefs, so they don't wait.
  const awaitingPrefs = !prefsLoaded && !prefsFailed && !urlView;

  const { data: product, isLoading: isProductLoading } =
    api.product.product.getBySlug.useQuery(
      { workspaceId: workspaceId ?? "", slug: productSlug },
      { enabled: !!workspaceId && !!productSlug },
    );

  const { data: graph, isLoading: isGraphLoading } =
    api.product.product.getDependencyGraph.useQuery(
      { productId: product?.id ?? "", includeCompleted: showCompleted },
      { enabled: !!product?.id },
    );

  // Names for the filter pills. A saved epic or cycle filter can name one
  // no drawn ticket carries (every ticket of it completed and hidden), and
  // the ticket-derived facets would then label it "Unknown".
  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "", productId: product?.id },
    { enabled: !!workspaceId && !!product?.id },
  );
  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "", productId: product?.id },
    { enabled: !!workspaceId && !!product?.id },
  );

  const allTickets = graph?.tickets;
  const allEdges = graph?.blockingEdges;
  const allFeatures = graph?.features;

  const facetOptions = useMemo(
    () => deriveTicketFacetOptions(allTickets ?? []),
    [allTickets],
  );
  const activeFilterCount = countActiveTicketFilters(filters);
  const isFiltered = activeFilterCount > 0;

  const { tickets: visibleTickets, dimmedTicketIds } = useMemo(
    () =>
      applyGraphFilter(
        allTickets ?? [],
        allEdges ?? [],
        isFiltered ? (t) => matchesTicketFilters(t, filters) : null,
      ),
    [allTickets, allEdges, filters, isFiltered],
  );

  // Features stay visible only while a matching (non-dimmed) ticket needs
  // them; blocking edges only when both endpoints are drawn.
  const visibleFeatures = useMemo(() => {
    if (!isFiltered) return allFeatures ?? [];
    const neededFeatureIds = new Set(
      visibleTickets
        .filter((t) => !dimmedTicketIds.has(t.id) && t.featureId)
        .map((t) => t.featureId),
    );
    return (allFeatures ?? []).filter((f) => neededFeatureIds.has(f.id));
  }, [allFeatures, visibleTickets, dimmedTicketIds, isFiltered]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleTickets.map((t) => t.id));
    return (allEdges ?? []).filter(
      (e) => ids.has(e.fromTicketId) && ids.has(e.toTicketId),
    );
  }, [allEdges, visibleTickets]);

  const members = useMemo(
    () =>
      (workspace?.members ?? []).map(
        (m: { user: { id: string; name: string | null } }) => ({
          id: m.user.id,
          name: m.user.name,
        }),
      ),
    [workspace?.members],
  );

  if (!workspace) return null;

  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  const applyFilters = (next: TicketFilters) => {
    if (urlView) {
      replaceView({ ...urlView, filters: next });
      return;
    }
    setPrefFilters(next);
    savePrefs({ filters: next });
  };
  const toggleFilter = (key: keyof TicketFilters, value: string) => {
    applyFilters(toggleTicketFilter(filters, key, value));
  };
  const clearFilters = () => {
    applyFilters(EMPTY_TICKET_FILTERS);
  };

  // Pills wait for the tickets: labels (tags) only resolve from them.
  const filterPills: ListPageFilterPill[] = (allTickets ? TICKET_FILTER_FACETS : []).flatMap(
    (facet) =>
      filters[facet.key].map((value) => ({
        key: `${facet.key}-${value}`,
        label: ticketFacetPillLabel(facet.key, value, facetOptions, { members, epics, cycles }),
        color: ticketFacetPillColor(facet.key, value),
        onRemove: () => toggleFilter(facet.key, value),
      })),
  );

  const handleNodeClick = (event: GraphNodeClick) => {
    switch (event.kind) {
      case "ticket":
        setDrawerTicketId(event.ticketId);
        return;
      case "feature":
        router.push(`${basePath}/features/${event.featureId}`);
        return;
      case "objective":
        router.push(`/w/${workspace.slug}/goals/${event.goalId}`);
        return;
      case "unaligned":
        // No-op — the Unaligned container is a grouping visual, not navigable.
        return;
    }
  };

  if (isProductLoading || awaitingPrefs || (product && isGraphLoading && !graph)) {
    return (
      <Stack gap="md">
        <Skeleton height={32} width={220} />
        <Skeleton height={600} />
      </Stack>
    );
  }

  if (!product) {
    return (
      <EmptyState
        icon={IconAffiliate}
        title="Product not found"
        message="We couldn't find this product."
      />
    );
  }

  const hasTickets = (graph?.tickets.length ?? 0) > 0;
  const hasVisibleTickets = visibleTickets.length > 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <ListPageFilterPills pills={filterPills} onClearAll={clearFilters} />
        <Group gap="sm" ml="auto">
          <ListPageFilterPopover
            aria-label="Filter tickets"
            facets={TICKET_FILTER_FACETS}
            options={facetOptions}
            selected={filters}
            activeCount={activeFilterCount}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
          {urlView && (
            <Tooltip label="Leave this shared view and go back to your own" withinPortal>
              <ListPageButton aria-label="Back to my view" onClick={exitView}>
                <IconArrowBackUp size={13} stroke={1.75} />
                My view
              </ListPageButton>
            </Tooltip>
          )}
          <Tooltip label="Copy a link to the graph with these filters" withinPortal>
            <ListPageButton
              aria-label="Copy link to this view"
              onClick={() => copyViewLink({ ...urlView, filters })}
            >
              <IconLink size={13} stroke={1.75} />
              Copy link
            </ListPageButton>
          </Tooltip>
          <Switch
            label="Show completed"
            checked={showCompleted}
            onChange={(event) => setShowCompleted(event.currentTarget.checked)}
          />
        </Group>
      </Group>
      {hasVisibleTickets ? (
        <DependencyGraphCanvas
          tickets={visibleTickets}
          features={visibleFeatures}
          objectives={graph!.objectives}
          blockingEdges={visibleEdges}
          dimmedTicketIds={dimmedTicketIds}
          onNodeClick={handleNodeClick}
        />
      ) : hasTickets ? (
        <EmptyState
          icon={IconAffiliate}
          title="No tickets match your filters"
          message="These filters are shared with the Backlog tab. Clear them to see the whole graph."
        />
      ) : (
        <EmptyState
          icon={IconAffiliate}
          title="No dependencies yet"
          message="Add tickets in the Backlog tab and link them with Depends on / Required for to see the dependency graph here."
        />
      )}
      <TicketDrawer
        ticketId={drawerTicketId}
        basePath={basePath}
        onClose={() => setDrawerTicketId(null)}
      />
    </Stack>
  );
}
