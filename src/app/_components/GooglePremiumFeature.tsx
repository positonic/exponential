"use client";

import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconLock, IconMail } from "@tabler/icons-react";

/**
 * Which gated Google feature the user just bumped into. Both depend on scopes
 * Google has not verified yet — see `isGoogleOAuthTester` in ~/lib/googleAuth.
 */
export type GooglePremiumFeatureKind = "calendar" | "contacts";

const COPY: Record<
  GooglePremiumFeatureKind,
  { title: string; body: string; mailto: string }
> = {
  calendar: {
    title: "Google Calendar — Premium Feature",
    body:
      "Google Calendar integration is currently available to select users during " +
      "our verification process. To request early access, contact our team.",
    mailto:
      "mailto:support@exponential.im?subject=Google%20Calendar%20Early%20Access",
  },
  contacts: {
    title: "Contact Import — Premium Feature",
    body:
      "Importing contacts from Google is currently available to select users. " +
      "To request early access, contact our team.",
    mailto:
      "mailto:support@exponential.im?subject=Contact%20Import%20Early%20Access",
  },
};

interface GooglePremiumFeatureProps {
  feature: GooglePremiumFeatureKind;
  /**
   * - `card`: full-bleed empty state (calendar page, dedicated page)
   * - `alert`: inline notice inside an existing modal/drawer
   * - `inline`: one-line hint, no call to action
   */
  variant?: "card" | "alert" | "inline";
}

function RequestAccessButton({ mailto }: { mailto: string }) {
  return (
    <Button
      component="a"
      href={mailto}
      variant="light"
      size="sm"
      leftSection={<IconMail size={16} />}
    >
      Request Access
    </Button>
  );
}

/**
 * The single place the "this Google feature isn't open yet" message is worded,
 * so the calendar page, settings, onboarding and CRM import all say the same
 * thing instead of drifting apart.
 */
export function GooglePremiumFeature({
  feature,
  variant = "card",
}: GooglePremiumFeatureProps) {
  const { title, body, mailto } = COPY[feature];

  if (variant === "inline") {
    return (
      <div className="mt-2 rounded-md border border-border-primary bg-surface-secondary p-2">
        <Group gap="xs" wrap="nowrap">
          <IconLock size={14} className="text-text-muted" />
          <Text size="xs" c="dimmed">
            {title}
          </Text>
        </Group>
      </div>
    );
  }

  if (variant === "alert") {
    return (
      <Alert icon={<IconLock size={16} />} color="blue" title={title}>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{body}</Text>
          <RequestAccessButton mailto={mailto} />
        </Stack>
      </Alert>
    );
  }

  return (
    <Paper
      p="xl"
      radius="md"
      withBorder
      className="border-border-primary bg-surface-secondary"
    >
      <Stack align="center" gap="lg">
        <IconLock size={48} className="text-text-muted" />
        <div className="text-center">
          <Title order={3} className="mb-2 text-text-primary">
            {title}
          </Title>
          <Text size="sm" c="dimmed" className="max-w-md">
            {body}
          </Text>
        </div>
        <RequestAccessButton mailto={mailto} />
      </Stack>
    </Paper>
  );
}
