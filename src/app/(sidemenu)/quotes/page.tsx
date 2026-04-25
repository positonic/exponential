"use client";

import { Container, Title, Text, Stack, Paper, Group, Badge } from "@mantine/core";
import { IconQuote, IconArrowLeft, IconStar } from "@tabler/icons-react";
import Link from "next/link";
import {
  CURATED_QUOTES,
  CATEGORY_LABELS,
  getQuoteOfTheDay,
  getQuotesByCategory,
  type QuoteCategory,
} from "~/app/_components/home/quotes";

export default function QuotesPage() {
  const todaysQuote = getQuoteOfTheDay();
  const quotesByCategory = getQuotesByCategory();
  const categories = Object.keys(quotesByCategory) as QuoteCategory[];

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group>
          <Link
            href="/settings"
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <IconArrowLeft size={16} />
            <Text size="sm">Back to Settings</Text>
          </Link>
        </Group>

        <div>
          <Title order={1} className="text-text-primary">
            Inspirational Quotes
          </Title>
          <Text c="dimmed" mt="xs">
            A collection of {CURATED_QUOTES.length} quotes to inspire your day
          </Text>
        </div>

        {/* Today's Quote - Highlighted */}
        <Paper
          p="lg"
          radius="md"
          className="bg-gradient-to-r from-brand-primary/10 to-brand-primary/5 border border-brand-primary/20"
        >
          <Group gap="xs" mb="sm">
            <IconStar size={18} className="text-brand-primary" />
            <Text fw={600} size="sm" className="text-brand-primary">
              Today&apos;s Quote
            </Text>
          </Group>
          <Text size="lg" className="text-text-primary italic">
            &ldquo;{todaysQuote.text}&rdquo;
          </Text>
          <Text size="sm" c="dimmed" mt="xs">
            &mdash; {todaysQuote.author}
          </Text>
        </Paper>

        {/* Quotes by Category */}
        {categories.map((category) => {
          const quotes = quotesByCategory[category];
          if (quotes.length === 0) return null;

          return (
            <div key={category}>
              <Group gap="sm" mb="md">
                <Title order={3} className="text-text-primary">
                  {CATEGORY_LABELS[category]}
                </Title>
                <Badge variant="light" size="sm">
                  {quotes.length}
                </Badge>
              </Group>

              <Stack gap="sm">
                {quotes.map((quote, index) => {
                  const isToday =
                    quote.text === todaysQuote.text &&
                    quote.author === todaysQuote.author;

                  return (
                    <Paper
                      key={index}
                      p="md"
                      withBorder
                      className={`${
                        isToday
                          ? "border-brand-primary/50 bg-brand-primary/5"
                          : "border-border-primary bg-surface-secondary"
                      }`}
                    >
                      <Group gap="sm" align="flex-start">
                        <IconQuote
                          size={16}
                          className={
                            isToday ? "text-brand-primary" : "text-text-muted"
                          }
                        />
                        <div className="flex-1">
                          <Text
                            size="sm"
                            className={
                              isToday
                                ? "text-text-primary font-medium"
                                : "text-text-primary"
                            }
                          >
                            &ldquo;{quote.text}&rdquo;
                          </Text>
                          <Text size="xs" c="dimmed" mt="xs">
                            &mdash; {quote.author}
                          </Text>
                        </div>
                        {isToday && (
                          <Badge size="xs" variant="light" color="blue">
                            Today
                          </Badge>
                        )}
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </div>
          );
        })}
      </Stack>
    </Container>
  );
}
