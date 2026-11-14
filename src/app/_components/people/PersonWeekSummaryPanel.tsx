'use client';

import { Button, Loader, Skeleton } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import {
  WeekPager,
  trpcErrorCode,
  useWeekPager,
} from '~/app/_components/home/activity/WeekPager';
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
 * A pager moves back through earlier weeks; regenerate rewrites the selected
 * week (rate-limited by the server).
 *
 * Shown on other people's pages only. Your own page shows your Weekly work
 * digest instead, which draws on more than the feed and stays private to you.
 */
export function PersonWeekSummaryPanel(props: PersonWeekSummaryPanelProps) {
  // The summary is written by a model; without an OpenAI key the panel is left out.
  const { openai } = useAiCapabilities();
  if (!openai) return null;
  // Keyed by subject, so moving to another person's page starts on this week.
  return <PersonWeekSummary key={props.userId} {...props} />;
}

function PersonWeekSummary({ userId, name }: PersonWeekSummaryPanelProps) {
  const utils = api.useUtils();
  const pager = useWeekPager();
  const { isCurrentWeek } = pager;
  const queryInput = { userId, ...pager.weekInput };

  const summaryQ = api.person.getWeekSummary.useQuery(queryInput, {
    // The server re-checks a stored summary on every read; this only dampens
    // refetch churn while the page is open.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // getWeekSummary is a query. Regenerate by fetching with force and seeding
  // the cache, as the Weekly work digest does.
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const weekKey = `${pager.selected.isoYear}-${pager.selected.isoWeek}`;
  useEffect(() => setRegenError(null), [weekKey]);

  const handleRegenerate = async () => {
    setRegenError(null);
    setIsRegenerating(true);
    try {
      const fresh = await utils.person.getWeekSummary.fetch({
        ...queryInput,
        force: true,
      });
      utils.person.getWeekSummary.setData(queryInput, fresh);
    } catch (err) {
      setRegenError(
        trpcErrorCode(err) === 'TOO_MANY_REQUESTS'
          ? 'Regenerated recently — try again shortly.'
          : "Couldn't regenerate the summary. Try again in a moment.",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const data = summaryQ.data;
  const busy = summaryQ.isLoading || isRegenerating;

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
        {data?.cached && !busy ? (
          <span className="wsa-digest__cached">cached</span>
        ) : null}

        <WeekPager
          label={pager.label}
          isCurrentWeek={isCurrentWeek}
          busy={busy}
          isRegenerating={isRegenerating}
          noun="summary"
          onPrev={pager.goPrevWeek}
          onNext={pager.goNextWeek}
          onRegenerate={() => void handleRegenerate()}
        />
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
          {isRegenerating ? (
            <div className="wsa-digest__loading">
              <Loader size="xs" />
              <span className="wsa-card__caption">Rewriting the summary…</span>
            </div>
          ) : null}

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
                } ${data.eventCount === 1 ? 'event' : 'events'} you can see ${
                  isCurrentWeek ? 'below' : 'from that week'
                }. Only you see this summary.`}
          </p>

          {regenError ? (
            <p className="wsa-digest__error mt-4">{regenError}</p>
          ) : null}

          {!isCurrentWeek ? (
            <div className="mt-4">
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={pager.goCurrentWeek}
              >
                Back to this week
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
