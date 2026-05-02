"use client";

import { Accordion, Text, Stack, List, ThemeIcon } from "@mantine/core";
import {
  IconInfoCircle,
  IconBulb,
  IconChecklist,
  IconBrain,
} from "@tabler/icons-react";

export function WeeklyReviewExplainer() {
  return (
    <Accordion
      variant="contained"
      radius="md"
      className="mt-8"
      styles={{
        item: {
          backgroundColor: "var(--color-surface-secondary)",
          borderColor: "var(--color-border-primary)",
        },
        control: {
          backgroundColor: "var(--color-surface-secondary)",
        },
      }}
    >
      <Accordion.Item value="about">
        <Accordion.Control
          icon={<IconInfoCircle size={20} className="text-brand-primary" />}
        >
          <Text fw={500} className="text-text-primary">
            About the Weekly Review
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="lg">
            {/* What is it */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color="blue"
                  radius="xl"
                >
                  <IconBulb size={14} />
                </ThemeIcon>
                <Text fw={600} className="text-text-primary">
                  What is it?
                </Text>
              </div>
              <Text size="sm" className="text-text-secondary">
                The Weekly Review is a cornerstone practice from David
                Allen&apos;s Getting Things Done (GTD) methodology. It&apos;s a
                dedicated time to step back from daily execution and ensure your
                productivity system reflects reality. Think of it as a weekly
                reset that keeps you in control.
              </Text>
            </div>

            {/* Why it matters */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color="green"
                  radius="xl"
                >
                  <IconBrain size={14} />
                </ThemeIcon>
                <Text fw={600} className="text-text-primary">
                  Why it matters
                </Text>
              </div>
              <List
                size="sm"
                spacing="xs"
                className="text-text-secondary"
                icon={
                  <span className="text-text-muted">•</span>
                }
              >
                <List.Item>
                  Clears mental clutter by reviewing all open commitments
                </List.Item>
                <List.Item>
                  Builds trust in your productivity system
                </List.Item>
                <List.Item>
                  Prevents projects from falling through the cracks
                </List.Item>
                <List.Item>
                  Creates space for strategic thinking vs reactive work
                </List.Item>
              </List>
            </div>

            {/* How it works */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color="violet"
                  radius="xl"
                >
                  <IconChecklist size={14} />
                </ThemeIcon>
                <Text fw={600} className="text-text-primary">
                  How it works
                </Text>
              </div>
              <List
                size="sm"
                type="ordered"
                spacing="xs"
                className="text-text-secondary"
              >
                <List.Item>
                  Review each active project to see what&apos;s changed
                </List.Item>
                <List.Item>
                  Update status and priority based on current reality
                </List.Item>
                <List.Item>
                  Capture any new actions or next steps that come to mind
                </List.Item>
                <List.Item>
                  Set your focus and intentions for the week ahead
                </List.Item>
              </List>
            </div>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
