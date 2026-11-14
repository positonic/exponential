"use client";

import { Text } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import { aiNotConfiguredMessage, type AiRequirement } from "~/server/services/ai/capabilities";

/**
 * The one "this AI feature is off" note, shown where someone would look for
 * the feature on an install without the key it needs. Same sentence as the
 * server's AiNotConfiguredError, so the UI and a rejected call agree.
 */
export function AiNotConfiguredNote({
  requirement,
  feature,
  className,
}: {
  requirement: AiRequirement;
  /** "Meeting summaries", "The Assistant", … */
  feature: string;
  className?: string;
}) {
  return (
    <Panel
      role="note"
      radius="md"
      padding="sm"
      className={`flex items-start gap-2 ${className ?? ""}`}
    >
      <IconSparkles size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
      <Text size="sm" className="text-text-secondary">
        {aiNotConfiguredMessage(requirement, feature)}
      </Text>
    </Panel>
  );
}
