'use client';

import { ActionIcon, Button, Loader, Skeleton, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconSparkles,
  IconUserStar,
} from '@tabler/icons-react';
import {
  addWeeks,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
  endOfISOWeek,
  subWeeks,
} from 'date-fns';
import { useMemo, useState } from 'react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { api } from '~/trpc/react';

import './activity-home.css';

interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

function isoWeekOf(date: Date): IsoWeek {
  return { isoYear: getISOWeekYear(date), isoWeek: getISOWeek(date) };
}

/** Reconstruct a Date that lands inside the given ISO week (its Monday). */
function dateForIsoWeek({ isoYear, isoWeek }: IsoWeek): Date {
  // Order matters: set the ISO-week-year first, then the week within it.
  return startOfISOWeek(setISOWeek(setISOWeekYear(new Date(), isoYear), isoWeek));
}

function sameIsoWeek(a: IsoWeek, b: IsoWeek): boolean {
  return a.isoYear === b.isoYear && a.isoWeek === b.isoWeek;
}

const FMT_DATE = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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
  const utils = api.useUtils();
  const currentWeek = useMemo(() => isoWeekOf(new Date()), []);
  const [selected, setSelected] = useState<IsoWeek>(currentWeek);

  const isCurrentWeek = sameIsoWeek(selected, currentWeek);

  // Omit isoYear/isoWeek for the current week so the server resolves "now".
  const queryInput = isCurrentWeek
    ? {}
    : { isoYear: selected.isoYear, isoWeek: selected.isoWeek };

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
      const code =
        err != null &&
        typeof err === 'object' &&
        'data' in err &&
        err.data != null &&
        typeof err.data === 'object' &&
        'code' in err.data
          ? (err.data as { code?: unknown }).code
          : undefined;
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
    setSelected(isoWeekOf(subWeeks(dateForIsoWeek(selected), 1)));
  };

  const goNextWeek = () => {
    if (isCurrentWeek) return;
    setRegenError(null);
    const next = isoWeekOf(addWeeks(dateForIsoWeek(selected), 1));
    // Clamp to the current week — never page into the future.
    setSelected(sameIsoWeek(next, currentWeek) || isFuture(next) ? currentWeek : next);
  };

  function isFuture(week: IsoWeek): boolean {
    return dateForIsoWeek(week).getTime() > dateForIsoWeek(currentWeek).getTime();
  }

  const weekRef = dateForIsoWeek(selected);
  const rangeLabel = `${FMT_DATE(startOfISOWeek(weekRef))} – ${FMT_DATE(endOfISOWeek(weekRef))}`;
  const pagerLabel = isCurrentWeek ? 'This week' : rangeLabel;

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

        <div className="wsa-digest__pager">
          <Tooltip label="Previous week" withArrow position="top">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Previous week"
              disabled={busy}
              onClick={goPrevWeek}
            >
              <IconChevronLeft size={15} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
          <span className="wsa-digest__pager-label">{pagerLabel}</span>
          <Tooltip
            label={isCurrentWeek ? 'No future weeks' : 'Next week'}
            withArrow
            position="top"
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Next week"
              disabled={busy || isCurrentWeek}
              onClick={goNextWeek}
            >
              <IconChevronRight size={15} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Regenerate digest" withArrow position="top">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Regenerate digest"
              disabled={busy}
              loading={isRegenerating}
              onClick={() => void handleRegenerate()}
            >
              <IconRefresh size={14} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </div>
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
                  setSelected(currentWeek);
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
