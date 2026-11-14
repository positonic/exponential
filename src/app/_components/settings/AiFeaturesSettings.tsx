"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { useAiCapabilities } from "~/providers/AiCapabilitiesProvider";
import { AI_SETUP_OPTIONS, type AiCapabilities } from "~/server/services/ai/capabilities";
import { SettingsSection } from "./SettingsShell";

const CAPABILITY_FOR_VARIABLE: Record<string, keyof AiCapabilities> = {
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  MASTRA_API_URL: "assistant",
};

/**
 * Where an admin looks for "why is there no AI here?": which AI this install
 * has and the variable that turns each part on. Shown only when something is
 * off, so an install with every key set (exponential.im) looks as before.
 */
export function AiFeaturesSettings() {
  const capabilities = useAiCapabilities();
  const rows = AI_SETUP_OPTIONS.map((option) => ({
    ...option,
    on: capabilities[CAPABILITY_FOR_VARIABLE[option.variable] ?? "openai"],
  }));
  if (rows.every((row) => row.on)) return null;

  return (
    <SettingsSection
      icon={IconSparkles}
      title="AI features"
      description="AI is optional. Set a variable on the server and restart to turn on what it covers."
    >
      <Stack gap="md">
        {rows.map((row) => (
          <Group key={row.variable} justify="space-between" align="flex-start" wrap="nowrap" gap="md">
            <div className="min-w-0">
              <Text size="sm" fw={600} className="text-text-primary">
                {row.label}
              </Text>
              <Text size="xs" className="text-text-secondary">
                {row.turnsOn}
              </Text>
              {!row.on && (
                <Text size="xs" className="text-text-muted" mt={2}>
                  Set <code>{row.variable}</code> and restart.
                </Text>
              )}
            </div>
            <Badge variant="light" color={row.on ? "green" : "gray"} className="shrink-0">
              {row.on ? "On" : "Off"}
            </Badge>
          </Group>
        ))}
      </Stack>
    </SettingsSection>
  );
}
