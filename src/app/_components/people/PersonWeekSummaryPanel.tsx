'use client';

import { Skeleton } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { useAiCapabilities } from '~/providers/AiCapabilitiesProvider';
import { api } from '~/trpc/react';

import '~/app/_components/home/activity/activity-home.css';

interface PersonWeekSummaryPanelProps {
  userId: string;
  /** The subject's display name. */
  name: string;
}

/**
 * Person week summary: an AI-written summary of someone else's week, above
 * their feed. It is written only from the events the viewer can see on this
 * page, and says so, so it is never mistaken for the whole of their week.
 *
 * Shown on other people's pages only. Your own page shows your Weekly work
 * digest instead, which draws on more than the feed and stays private to you.
 */
export function PersonWeekSummaryPanel(props: PersonWeekSummaryPanelProps) {
  // The summary is written by a model; without an OpenAI key the panel is left out.
  const { openai } = useAiCapabilities();
  if (!openai) return null;
  return <PersonWeekSummary {...props} />;
}

function PersonWeekSummary({ userId, name }: PersonWeekSummaryPanelProps) {
  const summaryQ = api.person.getWeekSummary.useQuery(
    { userId },
    { staleTime: 30 * 60 * 1000, retry: false },
  );
  const data = summaryQ.data;

  return (
    <section
      className="wsa-card wsa-digest wsa-digest--summary"
      aria-label={`Summary of ${name}'s week`}
      data-testid="person-week-summary"
    >
      <div className="wsa-digest__head">
        <span className="wsa-digest__eyebrow">
          <IconSparkles size={14} stroke={1.8} />
          {name}&apos;s week, as you can see it
        </span>
      </div>

      {summaryQ.isLoading ? (
        <div aria-hidden="true">
          <Skeleton height={14} width="92%" />
          <Skeleton height={14} mt={8} width="78%" />
          <Skeleton height={14} mt={8} width="64%" />
        </div>
      ) : summaryQ.isError || !data ? (
        <p className="wsa-digest__error">
          Couldn&apos;t write a summary just now. The activity below is unaffected.
        </p>
      ) : (
        <>
          <MarkdownRenderer
            content={data.narrative}
            variant="prose"
            className="wsa-digest__narrative"
          />

          {data.highlights.length > 0 ? (
            <ul className="wsa-digest__highlights">
              {data.highlights.map((highlight, index) => (
                <li className="wsa-digest__highlight" key={index}>
                  <span className="wsa-digest__highlight-dot" aria-hidden="true" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="wsa-digest__sub" data-testid="person-week-summary-basis">
            {data.eventCount === 0
              ? 'Only you see this.'
              : `Written by AI from the ${
                  data.truncated ? `latest ${data.eventCount}` : data.eventCount
                } ${data.eventCount === 1 ? 'event' : 'events'} you can see below. Only you see this summary.`}
          </p>
        </>
      )}
    </section>
  );
}
