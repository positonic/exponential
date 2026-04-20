"use client";

import { ActionIcon, HoverCard, List, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

export function KeyResultGuidanceIcon() {
  return (
    <HoverCard width={340} shadow="md" position="top" withArrow openDelay={100}>
      <HoverCard.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="What makes a good Key Result?"
          styles={{
            root: {
              color: "var(--color-text-secondary)",
            },
          }}
        >
          <IconInfoCircle size={16} />
        </ActionIcon>
      </HoverCard.Target>
      <HoverCard.Dropdown
        styles={{
          dropdown: {
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border-primary)",
          },
        }}
      >
        <Stack gap="xs">
          <Text fw={600} size="sm" c="var(--color-text-primary)">
            A good Key Result is:
          </Text>
          <List size="sm" spacing={4} c="var(--color-text-secondary)">
            <List.Item>
              <Text size="sm" c="var(--color-text-secondary)">
                <Text span fw={600} c="var(--color-text-primary)">
                  Measurable
                </Text>{" "}
                — has a number and a unit (%, count, $, hours)
              </Text>
            </List.Item>
            <List.Item>
              <Text size="sm" c="var(--color-text-secondary)">
                <Text span fw={600} c="var(--color-text-primary)">
                  An outcome, not an activity
                </Text>{" "}
                — describes the result, not the work to do it
              </Text>
            </List.Item>
            <List.Item>
              <Text size="sm" c="var(--color-text-secondary)">
                <Text span fw={600} c="var(--color-text-primary)">
                  Time-bound
                </Text>{" "}
                — tied to an OKR period (Q1, H1, Annual)
              </Text>
            </List.Item>
            <List.Item>
              <Text size="sm" c="var(--color-text-secondary)">
                <Text span fw={600} c="var(--color-text-primary)">
                  Owned
                </Text>{" "}
                — has a single DRI accountable for the number moving
              </Text>
            </List.Item>
          </List>

          <Stack gap={2} mt="xs">
            <Text size="xs" c="var(--color-text-muted)">
              ❌ “Complete OKR workshop by end of Feb” — that&apos;s a task
            </Text>
            <Text size="xs" c="var(--color-text-muted)">
              ✅ “Increase Q1 revenue from $50k to $75k” — that&apos;s a KR
            </Text>
          </Stack>

          <Text size="xs" c="var(--color-text-muted)" mt="xs">
            If you can mark it “done” with a checkbox, it&apos;s an initiative.
            If it has a starting number moving toward a target number, it&apos;s
            a KR.
          </Text>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
