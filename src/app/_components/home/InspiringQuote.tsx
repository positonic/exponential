"use client";

import { useState, useEffect } from "react";
import { Paper, Text, Group, CloseButton, Transition } from "@mantine/core";
import { IconQuote } from "@tabler/icons-react";
import { getQuoteOfTheDay } from "./quotes";
import { api } from "~/trpc/react";

const QUOTE_DISMISSAL_KEY = "quote-dismissed-date";

export function InspiringQuote() {
  const [isVisible, setIsVisible] = useState(false);
  const [quote, setQuote] = useState(getQuoteOfTheDay());

  const { data: preferences, isLoading: preferencesLoading } =
    api.navigationPreference.getPreferences.useQuery();

  useEffect(() => {
    // Check if already dismissed today
    const dismissedDate = localStorage.getItem(QUOTE_DISMISSAL_KEY);
    const today = new Date().toISOString().split("T")[0];
    setIsVisible(dismissedDate !== today);
    setQuote(getQuoteOfTheDay());
  }, []);

  // Don't render if preference is disabled
  if (preferencesLoading) {
    return null;
  }

  if (preferences?.showInspiringQuote === false) {
    return null;
  }

  const handleDismiss = () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(QUOTE_DISMISSAL_KEY, today ?? "");
    setIsVisible(false);
  };

  // Let Transition handle visibility via mounted prop for proper exit animation
  return (
    <Transition mounted={isVisible} transition="fade" duration={200}>
      {(styles) => (
        <Paper
          style={styles}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary mb-6"
        >
          <Group justify="space-between" align="flex-start">
            <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
              <IconQuote size={20} className="mt-1 text-brand-primary" />
              <div>
                <Text size="md" className="italic text-text-primary">
                  &ldquo;{quote.text}&rdquo;
                </Text>
                <Text size="sm" className="mt-1 text-text-muted">
                  &mdash; {quote.author}
                </Text>
              </div>
            </Group>
            <CloseButton
              size="sm"
              onClick={handleDismiss}
              aria-label="Dismiss quote for today"
            />
          </Group>
        </Paper>
      )}
    </Transition>
  );
}
