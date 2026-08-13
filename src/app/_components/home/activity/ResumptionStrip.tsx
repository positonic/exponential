'use client';

import Link from 'next/link';
import { UnstyledButton } from '@mantine/core';
import { IconFileText, IconMicrophone } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { compactAge } from '~/app/_components/product/overview/overviewShared';

const MAX_ROWS = 3;

/**
 * Bottom-of-page resumption strip: "pick up where you left off". Two small
 * cards — pages you recently touched and meetings you were in. Low urgency,
 * high utility, deliberately last. Each card hides when empty; the strip
 * hides when both are.
 */
export function ResumptionStrip() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: pages } = api.yourWork.recentPages.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );
  const { data: meetings } = api.transcription.getAllTranscriptions.useQuery(
    { workspaceId: workspaceId ?? undefined, meetingType: 'mine' },
    { enabled: !!workspaceId },
  );

  if (!workspaceId || !workspaceSlug) return null;

  const recentPages = (pages ?? []).slice(0, MAX_ROWS);
  const recentMeetings = (meetings ?? []).slice(0, MAX_ROWS);
  if (recentPages.length === 0 && recentMeetings.length === 0) return null;

  return (
    <div className="wsa-resume">
      {recentPages.length > 0 && (
        <section className="wsa-card">
          <div className="wsa-card__head">
            <h2 className="wsa-card__title">
              <IconFileText size={14} stroke={1.8} />
              Recent pages
            </h2>
            <Link href={`/w/${workspaceSlug}/pages`} className="wsa-sub__action">
              All pages →
            </Link>
          </div>
          {recentPages.map((page) => (
            <UnstyledButton
              key={page.id}
              component={Link}
              href={`/w/${workspaceSlug}/pages/${page.id}`}
              className="wsa-item"
            >
              <span className="wsa-item__icon">
                <IconFileText size={14} stroke={1.75} />
              </span>
              <span className="wsa-item__label">
                {page.title || 'Untitled page'}
                {page.project && (
                  <span className="wsa-item__sub">{page.project.name}</span>
                )}
              </span>
              <span className="wsa-item__meta">{compactAge(page.updatedAt)}</span>
            </UnstyledButton>
          ))}
        </section>
      )}

      {recentMeetings.length > 0 && (
        <section className="wsa-card">
          <div className="wsa-card__head">
            <h2 className="wsa-card__title">
              <IconMicrophone size={14} stroke={1.8} />
              Recent meetings
            </h2>
          </div>
          {recentMeetings.map((meeting) => (
            <UnstyledButton
              key={meeting.id}
              component={Link}
              href={`/recording/${meeting.id}`}
              className="wsa-item"
            >
              <span className="wsa-item__icon">
                <IconMicrophone size={14} stroke={1.75} />
              </span>
              <span className="wsa-item__label">
                {meeting.title ?? 'Untitled meeting'}
              </span>
              <span className="wsa-item__meta">
                {compactAge(meeting.meetingDate ?? meeting.createdAt)}
              </span>
            </UnstyledButton>
          ))}
        </section>
      )}
    </div>
  );
}
