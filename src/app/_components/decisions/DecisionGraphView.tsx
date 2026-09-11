"use client";

import { useCallback, useMemo } from "react";
import { Anchor, Container, Group, Menu, Skeleton, Text, Title } from "@mantine/core";
import { IconAffiliate, IconArrowLeft, IconChevronDown, IconTimeline } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { buildDecisionGraph, type GraphEdgeType } from "~/lib/decision-graph";
import { DecisionGraphCanvas } from "~/app/_components/decisions/DecisionGraphCanvas";
import { DecisionTimeline } from "~/app/_components/decisions/DecisionTimeline";
import "./decisions-index.css";
import "./decision-timeline.css";

/**
 * The full-screen decision graph (compact header row + a canvas filling the
 * remaining viewport), shared between the workspace graph page
 * (/w/[slug]/decisions/graph) and the product graph lens
 * (/w/[slug]/products/[productSlug]/decisions/graph). Two views over the
 * same merged graph (ADR-0060: one log, two sources — ADRs from `adr.graph`
 * beside Decisions from `decision.list`, joined client-side):
 *
 * - Timeline (default): time left to right, one lane per repository or
 *   ceremony / project, so a decision's place in the story is its position.
 * - Network: the React Flow cluster view, one column per lane.
 *
 * The view is picked from a dropdown and kept in the URL (`?view=`) so a
 * link opens the same picture. Click a card or node to open the decision.
 * Read-only, like the whole Decision Log.
 *
 * With `productId` (+ `includeWorkspaceWide`) the graph is scoped the same way
 * the index's product filter scopes the table. `heightClassName` sizes the
 * shell — the canvas fills it — because each page sits under different chrome
 * (the product lens renders below the product header and tab strip).
 */

type GraphViewType = "timeline" | "network";

const VIEWS: Array<{ value: GraphViewType; label: string; hint: string; icon: React.ReactNode }> = [
  {
    value: "timeline",
    label: "Timeline",
    hint: "Left to right by date, one lane per repository or ceremony",
    icon: <IconTimeline size={14} stroke={1.75} />,
  },
  {
    value: "network",
    label: "Network",
    hint: "Clustered by repository, links drawn between decisions",
    icon: <IconAffiliate size={14} stroke={1.75} />,
  },
];

const EDGE_LEGEND: Array<{ type: GraphEdgeType; label: string }> = [
  { type: "SUPERSEDES", label: "supersedes" },
  { type: "MENTIONS", label: "mentions (detected)" },
  { type: "FORMALISED", label: "formalised as ADR" },
];

const STATUS_LEGEND: Array<{ dot: string; label: string }> = [
  { dot: "accepted", label: "Accepted" },
  { dot: "proposed", label: "Proposed" },
  { dot: "open", label: "Open" },
  { dot: "superseded", label: "Superseded" },
  { dot: "deprecated", label: "Deprecated" },
];

function parseView(raw: string | null): GraphViewType {
  return raw === "network" ? "network" : "timeline";
}

interface DecisionGraphViewProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Where the "All decisions" back link points. */
  backHref: string;
  /** Short hint shown beside the title on wider screens. */
  description?: string;
  /** Height of the full-screen shell; the canvas fills whatever this allows. */
  heightClassName?: string;
  /** Scope to one product's repos. */
  productId?: string;
  /** With productId: also include workspace-level (null-product) repos. */
  includeWorkspaceWide?: boolean;
}

export function DecisionGraphView({
  workspaceId,
  workspaceSlug,
  backHref,
  description = "Click a decision to open it.",
  heightClassName = "h-[calc(100dvh-120px)]",
  productId,
  includeWorkspaceWide,
}: DecisionGraphViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams?.get("view") ?? null);

  // The view lives in the URL (shareable, survives reload) but a switch is a
  // client-only concern — replaceState rather than router.replace so the
  // async (sidemenu) layout is not refetched for a purely visual change.
  // Next syncs useSearchParams from native replaceState only when the state
  // argument is NOT its own (a state carrying its marker is treated as an
  // internal navigation), hence the null.
  const setView = useCallback((next: GraphViewType) => {
    const url = new URL(window.location.href);
    if (next === "timeline") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const { data: adrGraph, isLoading: adrLoading } = api.adr.graph.useQuery(
    { workspaceId, productId, includeWorkspaceWide },
    { enabled: !!workspaceId },
  );
  const { data: decisions, isLoading: decisionsLoading } = api.decision.list.useQuery(
    { workspaceId, productId, includeWorkspaceWide: includeWorkspaceWide || undefined },
    { enabled: !!workspaceId },
  );

  const graph = useMemo(
    () =>
      adrGraph
        ? buildDecisionGraph({
            adrs: adrGraph,
            decisions: decisions ?? [],
            workspaceSlug,
          })
        : null,
    [adrGraph, decisions, workspaceSlug],
  );

  const backLink = (
    <Anchor
      component={Link}
      href={backHref}
      size="sm"
      className="text-text-secondary"
    >
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={14} />
        All decisions
      </Group>
    </Anchor>
  );

  if (adrLoading || decisionsLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={500} />
      </Container>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <Container size="xl" className="py-8">
        {backLink}
        <Title order={2} mt="md" mb={4}>
          Decision graph
        </Title>
        <Text className="text-text-secondary">
          No decisions synced or logged yet — nothing to draw.
        </Text>
      </Container>
    );
  }

  const current = VIEWS.find((v) => v.value === view) ?? VIEWS[0]!;

  return (
    <div
      className={`dec-surface flex ${heightClassName} flex-col overflow-hidden px-4 pt-4 lg:px-6`}
    >
      <Group justify="space-between" align="center" mb="sm" wrap="wrap">
        <Group gap="md" wrap="nowrap">
          {backLink}
          <Title order={3}>Decision graph</Title>
          <Menu shadow="md" width={300} position="bottom-start">
            <Menu.Target>
              <button type="button" className="dec-ghost dtl-view" aria-label="Change graph view">
                {current.icon}
                {current.label}
                <IconChevronDown size={12} stroke={1.75} className="dtl-view__chev" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>View</Menu.Label>
              {VIEWS.map((v) => (
                <Menu.Item
                  key={v.value}
                  leftSection={v.icon}
                  onClick={() => setView(v.value)}
                  aria-current={v.value === view ? "true" : undefined}
                  className={v.value === view ? "font-semibold" : undefined}
                >
                  <div>{v.label}</div>
                  <Text size="xs" className="text-text-muted">
                    {v.hint}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Text size="sm" className="text-text-secondary" visibleFrom="md">
            {description}
          </Text>
        </Group>
        <div className="dtl-legend" aria-label="Legend">
          {STATUS_LEGEND.map((s) => (
            <span key={s.dot} className="dtl-legend__item">
              <span className={`dot dot--${s.dot}`} />
              {s.label}
            </span>
          ))}
          <span className="dtl-legend__sep" aria-hidden />
          {EDGE_LEGEND.map((e) => (
            <span key={e.type} className="dtl-legend__item">
              <span aria-hidden className={`dtl-legend__line dtl-legend__line--${e.type}`} />
              {e.label}
            </span>
          ))}
        </div>
      </Group>

      <div className="min-h-0 flex-1 pb-4">
        {view === "timeline" ? (
          <DecisionTimeline graph={graph} />
        ) : (
          <DecisionGraphCanvas graph={graph} onNodeClick={(node) => router.push(node.href)} />
        )}
      </div>
    </div>
  );
}
