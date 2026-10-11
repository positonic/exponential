"use client";

import Link from "next/link";
import { Badge, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { decisionStatusBadge } from "~/app/_components/decisions/DetailPreview";

/**
 * The Decisions block for a feature - decisions linked "implemented by" it
 * (ADR-0060). Grouped by status rather than by a link type: an OPEN decision
 * linked to a feature reads as a question raised on it, everything else as a
 * decision the feature carries out.
 *
 * Renders nothing until something is linked, so features without decisions
 * keep the page they had.
 */
export function FeatureDecisionsSection({
  featureId,
  workspaceId,
  workspaceSlug,
}: {
  featureId: string;
  workspaceId: string | null | undefined;
  workspaceSlug: string | undefined;
}) {
  const { data: decisions } = api.decision.listForFeature.useQuery(
    { workspaceId: workspaceId ?? "", featureId },
    { enabled: !!workspaceId && !!featureId },
  );

  if (!decisions || decisions.length === 0) return null;

  const openQuestions = decisions.filter((d) => d.status === "OPEN");
  const decided = decisions.filter((d) => d.status !== "OPEN");

  return (
    <CollapsibleSection
      title="Decisions"
      meta={
        openQuestions.length > 0
          ? `${decided.length} decided · ${openQuestions.length} open`
          : String(decided.length)
      }
    >
      <div className="flex flex-col gap-3">
        {openQuestions.length > 0 && (
          <DecisionGroup
            title="Open questions"
            decisions={openQuestions}
            workspaceSlug={workspaceSlug}
          />
        )}
        {decided.length > 0 && (
          <DecisionGroup
            title="Decisions"
            decisions={decided}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>
    </CollapsibleSection>
  );
}

interface DecisionRow {
  id: string;
  label: string;
  statement: string;
  status: string;
}

function DecisionGroup({
  title,
  decisions,
  workspaceSlug,
}: {
  title: string;
  decisions: DecisionRow[];
  workspaceSlug: string | undefined;
}) {
  return (
    <div>
      <Text fz={11} fw={600} className="text-text-muted mb-1.5">
        {title}
      </Text>
      {/* The container-list grammar (see DESIGN.md): one bordered container,
          divider-separated rows - same as Scopes, Requirements, and Tickets. */}
      <div className="border border-border-primary rounded-lg overflow-hidden">
        {decisions.map((decision, i) => {
          const badge = decisionStatusBadge(decision.status);
          return (
            <Link
              key={decision.id}
              href={`/w/${workspaceSlug}/decisions/d/${decision.id}`}
              className={`flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-surface-hover ${i < decisions.length - 1 ? "border-b border-border-primary" : ""}`}
            >
              <Text size="xs" className="text-text-muted font-mono w-14 shrink-0">
                {decision.label}
              </Text>
              <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
                {decision.statement}
              </Text>
              <Badge size="xs" variant="light" color={badge.color} className="shrink-0">
                {badge.label}
              </Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
