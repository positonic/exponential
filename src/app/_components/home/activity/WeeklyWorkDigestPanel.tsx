'use client';

import { Button, Loader, Skeleton } from '@mantine/core';
import { IconSparkles, IconUserStar } from '@tabler/icons-react';
import { useState } from 'react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { useAiCapabilities } from "~/providers/AiCapabilitiesProvider";
import { api } from '~/trpc/react';
import { WeekPager, trpcErrorCode, useWeekPager } from './WeekPager';

import './activity-home.css';

/**
 * Weekly work digest — a personal, cross-workspace panel that sits atop the
 * `/activity` feed ("the story of your week" over "every event"). Reads
 * `workspace.getMyWeeklyWorkDigest` for the selected ISO week and renders the
 * narrative, highlights, and AI-suggested content angles. A week pager moves
 * back through prior ISO weeks (never into the future); a regenerate action
 * re-runs synthesis with `force` and degrades gracefully when the server's
 * cooldown trips (`TOO_MANY_REQUESTS`).
 *
 * Deliberately visually distinct from the team Week-in-Review (.wsa-week):
 * a violet accent + left rail mark this as a private artifact. See ADR-0018.
 */
export function WeeklyWorkDigestPanel() {
  // The digest is written by a model; without an OpenAI key the panel is left out.
  const { openai } = useAiCapabilities();
  if (!openai) return null;
  return <WeeklyWorkDigest />;
}

function WeeklyWorkDigest() {
  const utils = api.useUtils();
  const pager = useWeekPager();
  const { isCurrentWeek } = pager;
  // Empty for the current week, so the server resolves "now".
  const queryInput = pager.weekInput;

  const digestQ = api.workspace.getMyWeeklyWorkDigest.useQuery(queryInput, {
    // Cache hits render instantly; this just dampens dev-mode refetch churn.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // getMyWeeklyWorkDigest is a query, not a mutation. Force-regenerate by
  // fetching with force:true via the utils client, then seeding the cache.
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const handleRegenerate = async () => {
    setRegenError(null);
    setIsRegenerating(true);
    try {
      const fresh = await utils.workspace.getMyWeeklyWorkDigest.fetch({
        ...queryInput,
        force: true,
      });
      utils.workspace.getMyWeeklyWorkDigest.setData(queryInput, fresh);
    } catch (err) {
      const code = trpcErrorCode(err);
      setRegenError(
        code === 'TOO_MANY_REQUESTS'
          ? 'Regenerated recently — try again shortly.'
          : "Couldn't regenerate the digest. Try again in a moment.",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const goPrevWeek = () => {
    setRegenError(null);
    pager.goPrevWeek();
  };

  const goNextWeek = () => {
    setRegenError(null);
    pager.goNextWeek();
  };

  const data = digestQ.data;
  const busy = digestQ.isLoading || isRegenerating;
  const angles = data?.angles ?? [];

  return (
    <section className="wsa-card wsa-digest" aria-label="Weekly work digest">
      <div className="wsa-digest__head">
        <span className="wsa-digest__eyebrow">
          <IconUserStar size={14} stroke={1.8} />
          Your week in work
        </span>
        {data?.cached && !busy ? (
          <span className="wsa-digest__cached">cached</span>
        ) : null}

        <WeekPager
          label={pager.label}
          isCurrentWeek={isCurrentWeek}
          busy={busy}
          isRegenerating={isRegenerating}
          noun="digest"
          onPrev={goPrevWeek}
          onNext={goNextWeek}
          onRegenerate={() => void handleRegenerate()}
        />
      </div>

      {digestQ.isLoading ? (
        <DigestSkeleton />
      ) : digestQ.isError ? (
        <p className="wsa-digest__error">
          Couldn&apos;t load your weekly digest. Try the refresh button, or check
          back shortly.
        </p>
      ) : data ? (
        <>
          {isRegenerating ? (
            <div className="wsa-digest__loading">
              <Loader size="xs" />
              <span className="wsa-card__caption">Regenerating your digest…</span>
            </div>
          ) : null}

          <MarkdownRenderer
            content={data.narrative}
            variant="prose"
            className="wsa-digest__narrative"
          />

          {data.highlights.length > 0 ? (
            <ul className="wsa-digest__highlights">
              {data.highlights.map((h, i) => (
                <li className="wsa-digest__highlight" key={i}>
                  <span className="wsa-digest__highlight-dot" aria-hidden="true" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="wsa-digest__angles">
            <p className="wsa-digest__section-label wsa-digest__angles-label">
              <IconSparkles size={13} stroke={1.8} />
              Content angles
            </p>
            {angles.length > 0 ? (
              <ul className="wsa-digest__angle-list">
                {angles.map((angle, i) => (
                  <li className="wsa-digest__angle" key={i}>
                    <span className="wsa-digest__angle-idx">{i + 1}</span>
                    <span>{angle}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wsa-digest__angles-empty">
                No content angles for this week yet — a quieter week leaves less to
                turn into posts. Come back after a busier stretch.
              </p>
            )}
          </div>

          {regenError ? (
            <p className="wsa-digest__error" style={{ marginTop: 16 }}>
              {regenError}
            </p>
          ) : null}

          {!isCurrentWeek ? (
            <div style={{ marginTop: 18 }}>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setRegenError(null);
                  pager.goCurrentWeek();
                }}
              >
                Back to this week
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function DigestSkeleton() {
  return (
    <div>
      <Skeleton height={14} width="92%" />
      <Skeleton height={14} width="84%" mt={8} />
      <Skeleton height={14} width="60%" mt={8} />
      <Skeleton height={11} width={90} mt={22} />
      <Skeleton height={13} width="70%" mt={12} />
      <Skeleton height={13} width="66%" mt={10} />
      <Skeleton height={13} width="72%" mt={10} />
      <Skeleton height={11} width={120} mt={24} />
      <Skeleton height={44} mt={12} radius="md" />
      <Skeleton height={44} mt={9} radius="md" />
    </div>
  );
}
